import { Repository, In } from 'typeorm';
import { Attendance } from '../../../attendance/domain/entities/attendance.entity';
import { Message } from '../../../message/domain/entities/message.entity';
import { User } from '../../../auth/domain/entities/user.entity';
import { QuoteRequest } from '../../../quote/domain/entities/quote-request.entity';
import { AttendanceState } from '../../../../shared/types/common.types';
import { logger } from '../../../../shared/utils/logger';
import axios from 'axios';
import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';

export interface ResetMemoryOptions {
  deleteMessages: boolean;
  deleteAiContext: boolean;
  deleteEmbeddings: boolean;
  resetAttendanceState: boolean;
}

export interface ResetMemoryResult {
  deleted: {
    messages: number;
    attendances: number;
    embeddings: number;
  };
  attendanceIds: string[];
}

export class AIMemoryResetService {
  private attendanceRepository: Repository<Attendance>;
  private messageRepository: Repository<Message>;
  private userRepository: Repository<User>;

  constructor() {
    this.attendanceRepository = AppDataSource.getRepository(Attendance);
    this.messageRepository = AppDataSource.getRepository(Message);
    this.userRepository = AppDataSource.getRepository(User);
  }

  /**
   * Reset memory by supervisor
   */
  async resetMemoryBySupervisor(
    supervisorId: string,
    options: ResetMemoryOptions,
  ): Promise<ResetMemoryResult> {
    logger.info('Resetting memory by supervisor', { supervisorId, options });

    // Atendimentos visíveis ao supervisor: supervisor_id = eu OU seller em seller_supervisors (N:N)
    const attendances = await this.attendanceRepository
      .createQueryBuilder('attendance')
      .where('attendance.supervisor_id = :supervisorId', { supervisorId })
      .orWhere(
        'attendance.seller_id IN (SELECT seller_id FROM seller_supervisors WHERE supervisor_id = :supervisorId)',
        { supervisorId }
      )
      .getMany();

    logger.info('Found attendances for supervisor', {
      supervisorId,
      count: attendances.length,
      withDirectSupervisorId: attendances.filter(a => a.supervisorId === supervisorId).length,
      withSellerId: attendances.filter(a => a.sellerId !== null).length,
    });

    if (attendances.length === 0) {
      logger.warn('No attendances found for supervisor', { supervisorId });
      return {
        deleted: { messages: 0, attendances: 0, embeddings: 0 },
        attendanceIds: [],
      };
    }

    const attendanceIds = attendances.map((a) => a.id);

    return await this.resetMemoryByAttendanceIds(attendanceIds, options);
  }

  /**
   * Reset memory by seller
   */
  async resetMemoryBySeller(
    sellerId: string,
    options: ResetMemoryOptions,
  ): Promise<ResetMemoryResult> {
    logger.info('Resetting memory by seller', { sellerId, options });

    // Get all attendances for this seller
    const attendances = await this.attendanceRepository.find({
      where: {
        sellerId: sellerId,
      },
    });

    const attendanceIds = attendances.map((a) => a.id);

    return await this.resetMemoryByAttendanceIds(attendanceIds, options);
  }

  /**
   * Reset memory by client phone
   */
  async resetMemoryByClient(
    clientPhone: string,
    sellerId?: string,
    options?: ResetMemoryOptions,
  ): Promise<ResetMemoryResult> {
    logger.info('Resetting memory by client', {
      clientPhone,
      sellerId,
      options,
    });

    // Build query
    const where: any = {
      clientPhone: clientPhone,
    };

    if (sellerId) {
      where.sellerId = sellerId;
    }

    // Get all attendances for this client
    const attendances = await this.attendanceRepository.find({ where });

    const attendanceIds = attendances.map((a) => a.id);

    return await this.resetMemoryByAttendanceIds(
      attendanceIds,
      options || {
        deleteMessages: true,
        deleteAiContext: true,
        deleteEmbeddings: true,
        resetAttendanceState: true,
      },
    );
  }

  /**
   * Reset memory for unassigned attendances (not routed yet)
   * These are attendances without supervisorId and without sellerId
   */
  async resetMemoryForUnassigned(
    options: ResetMemoryOptions,
  ): Promise<ResetMemoryResult> {
    logger.info('Resetting memory for unassigned attendances', { options });

    // Get all attendances that are not routed (no supervisorId)
    // These are attendances that haven't been assigned to a supervisor yet
    const attendances = await this.attendanceRepository
      .createQueryBuilder('attendance')
      .where('attendance.supervisor_id IS NULL')
      .getMany();

    logger.info('Found unassigned attendances', {
      count: attendances.length,
      withoutSupervisorAndSeller: attendances.filter(a => !a.supervisorId && !a.sellerId).length,
      withoutSupervisor: attendances.filter(a => !a.supervisorId).length,
    });

    if (attendances.length === 0) {
      logger.warn('No unassigned attendances found');
      return {
        deleted: { messages: 0, attendances: 0, embeddings: 0 },
        attendanceIds: [],
      };
    }

    const attendanceIds = attendances.map((a) => a.id);

    return await this.resetMemoryByAttendanceIds(attendanceIds, options);
  }

  /**
   * Reset memory for specific attendance IDs
   */
  private async resetMemoryByAttendanceIds(
    attendanceIds: string[],
    options: ResetMemoryOptions,
  ): Promise<ResetMemoryResult> {
    if (attendanceIds.length === 0) {
      logger.warn('No attendances to reset');
      return {
        deleted: { messages: 0, attendances: 0, embeddings: 0 },
        attendanceIds: [],
      };
    }

    logger.info('Resetting memory for attendances', {
      count: attendanceIds.length,
      options,
    });

    const result: ResetMemoryResult = {
      deleted: {
        messages: 0,
        attendances: 0,
        embeddings: 0,
      },
      attendanceIds: [],
    };

    try {
      // 1. Delete messages
      if (options.deleteMessages) {
        const deleteResult = await this.messageRepository.delete({
          attendanceId: In(attendanceIds),
        });
        result.deleted.messages = deleteResult.affected || 0;
        logger.info('Deleted messages', { count: result.deleted.messages });
      }

      // 2. Delete AI context (summaries)
      if (options.deleteAiContext) {
        const updateResult = await this.attendanceRepository
          .createQueryBuilder()
          .update(Attendance)
          .set({ aiContext: null })
          .where('id IN (:...ids)', { ids: attendanceIds })
          .execute();
        result.deleted.attendances = updateResult.affected || 0;
        logger.info('Cleared AI context', {
          count: result.deleted.attendances,
        });
      }

      // 3. Delete embeddings from Vector DB (Qdrant)
      if (options.deleteEmbeddings && attendanceIds.length > 0) {
        try {
          const embeddingsDeleted = await this.deleteEmbeddings(attendanceIds);
          result.deleted.embeddings = embeddingsDeleted;
          logger.info('Deleted embeddings', { count: embeddingsDeleted });
        } catch (embeddingError: any) {
          // Log but don't fail the entire reset if embeddings deletion fails
          logger.error('Failed to delete embeddings, continuing reset', {
            error: embeddingError.message,
            attendanceIds: attendanceIds.length,
          });
          result.deleted.embeddings = 0;
        }
      }

      // 4. Reset attendance state
      if (options.resetAttendanceState) {
        const updateResult = await this.attendanceRepository
          .createQueryBuilder()
          .update(Attendance)
          .set({ state: AttendanceState.OPEN }) // Use enum value instead of string
          .where('id IN (:...ids)', { ids: attendanceIds })
          .execute();
        logger.info('Reset attendance states', { 
          count: attendanceIds.length,
          affected: updateResult.affected || 0,
        });
      }

      // 5. Clear multi-agent per-attendance state (last routed specialist, etc.)
      try {
        await AppDataSource
          .createQueryBuilder()
          .delete()
          .from('attendance_last_routed_specialist')
          .where('attendance_id IN (:...ids)', { ids: attendanceIds })
          .execute();

        logger.info('Cleared multi-agent state (last routed specialist) for attendances', {
          count: attendanceIds.length,
        });
      } catch (multiAgentError: any) {
        // Não falhar o reset de memória se a limpeza do multi-agente der erro
        logger.error('Failed to clear multi-agent state during memory reset', {
          error: multiAgentError.message,
          attendanceIdsCount: attendanceIds.length,
        });
      }

      result.attendanceIds = attendanceIds;

      logger.info('Memory reset completed', { result });
      return result;
    } catch (error: any) {
      logger.error('Error resetting memory', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Delete embeddings from Qdrant Vector DB
   */
  private async deleteEmbeddings(attendanceIds: string[]): Promise<number> {
    if (!attendanceIds || attendanceIds.length === 0) {
      return 0;
    }

    try {
      const qdrantHost = process.env.QDRANT_HOST || 'localhost';
      const qdrantPort = process.env.QDRANT_PORT || '6333';
      const collectionName = 'attendance_summaries';

      logger.info('Deleting embeddings from Qdrant', {
        count: attendanceIds.length,
        collection: collectionName,
        host: `${qdrantHost}:${qdrantPort}`,
      });

      // Delete points by attendance IDs
      // Qdrant uses point IDs, which in our case are attendance IDs
      const response = await axios.post(
        `http://${qdrantHost}:${qdrantPort}/collections/${collectionName}/points/delete`,
        {
          points: attendanceIds,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000, // Increased timeout for large deletions
          validateStatus: (status) => status < 500, // Don't throw on 404 (collection doesn't exist)
        },
      );

      if (response.data && (response.data.status === 'ok' || response.status === 200)) {
        logger.info('Embeddings deleted from Qdrant', {
          count: attendanceIds.length,
        });
        return attendanceIds.length;
      }

      logger.warn('Qdrant deletion returned unexpected response', {
        status: response.status,
        data: response.data,
      });
      return 0;
    } catch (error: any) {
      // Check if Qdrant is not available (ECONNREFUSED, ENOTFOUND, etc.)
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        logger.warn('Qdrant not available, skipping embedding deletion', {
          error: error.message,
          code: error.code,
        });
      } else {
        logger.error('Error deleting embeddings from Qdrant', {
          error: error.message,
          code: error.code,
          attendanceIds: attendanceIds.length,
        });
      }
      // Don't throw - embeddings deletion is not critical
      // The reset should continue even if Qdrant fails
      return 0;
    }
  }

  /**
   * Get clients by seller (for dropdown)
   */
  async getClientsBySeller(sellerId: string): Promise<string[]> {
    try {
      const attendances = await this.attendanceRepository
        .createQueryBuilder('attendance')
        .select('DISTINCT attendance.clientPhone', 'clientPhone')
        .where('attendance.sellerId = :sellerId', { sellerId })
        .andWhere('attendance.clientPhone IS NOT NULL')
        .orderBy('attendance.clientPhone', 'ASC')
        .getRawMany();

      return attendances.map((a) => a.clientPhone);
    } catch (error: any) {
      logger.error('Error getting clients by seller', {
        error: error.message,
        sellerId,
      });
      return [];
    }
  }

  /**
   * Get clients by supervisor (for dropdown)
   */
  async getClientsBySupervisor(supervisorId: string): Promise<string[]> {
    try {
      const attendances = await this.attendanceRepository
        .createQueryBuilder('attendance')
        .select('DISTINCT attendance.clientPhone', 'clientPhone')
        .where('attendance.supervisor_id = :supervisorId', { supervisorId })
        .orWhere(
          'attendance.seller_id IN (SELECT seller_id FROM seller_supervisors WHERE supervisor_id = :supervisorId)',
          { supervisorId }
        )
        .andWhere('attendance.clientPhone IS NOT NULL')
        .orderBy('attendance.clientPhone', 'ASC')
        .getRawMany();

      return attendances.map((a) => a.clientPhone);
    } catch (error: any) {
      logger.error('Error getting clients by supervisor', {
        error: error.message,
        supervisorId,
      });
      return [];
    }
  }

  /**
   * Wipe ALL data: memory, attendances, clients, and quote requests.
   * Deletes in correct order to respect foreign key constraints.
   */
  async wipeAllData(): Promise<{
    deleted: {
      messages: number;
      quoteRequests: number;
      attendances: number;
      embeddings: number;
    };
  }> {
    logger.warn('⚠️ WIPE ALL DATA REQUESTED - This will delete EVERYTHING: memory, attendances, clients, quote requests!');

    const result = {
      deleted: {
        messages: 0,
        quoteRequests: 0,
        attendances: 0,
        embeddings: 0,
      },
    };

    try {
      const allAttendances = await this.attendanceRepository.find({ select: ['id'] });
      const allAttendanceIds = allAttendances.map((a) => a.id);

      // 1. Delete embeddings from Qdrant (need IDs before deleting attendances)
      if (allAttendanceIds.length > 0) {
        try {
          result.deleted.embeddings = await this.deleteEmbeddings(allAttendanceIds);
        } catch (e: any) {
          logger.warn('Embeddings deletion failed, continuing', { error: e?.message });
        }
      }

      const queryRunner = AppDataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // 2. message_reads
        await queryRunner.query('DELETE FROM message_reads');
        // 3. messages (TypeORM não permite delete com critério vazio, usar QueryBuilder)
        const msgResult = await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(Message)
          .where('1=1')
          .execute();
        result.deleted.messages = msgResult.affected ?? 0;
        // 4. quote_requests
        const quoteResult = await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(QuoteRequest)
          .where('1=1')
          .execute();
        result.deleted.quoteRequests = quoteResult.affected ?? 0;
        // 5. attendance_last_routed_specialist
        await queryRunner.query('DELETE FROM attendance_last_routed_specialist');
        // 6. attendance_cases
        await queryRunner.query('DELETE FROM attendance_cases');
        // 7. ai_response_costs
        await queryRunner.query('DELETE FROM ai_response_costs');
        // 8. routing_decisions
        await queryRunner.query('DELETE FROM routing_decisions');
        // 9. notifications
        await queryRunner.query('DELETE FROM notifications');
        // 10. warranties
        await queryRunner.query('DELETE FROM warranties');
        // 11. purchases
        await queryRunner.query('DELETE FROM purchases');
        // 12. attendances
        const attResult = await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(Attendance)
          .where('1=1')
          .execute();
        result.deleted.attendances = attResult.affected ?? 0;

        await queryRunner.commitTransaction();
        logger.info('Wipe all data completed', { result });
      } catch (txError: any) {
        await queryRunner.rollbackTransaction();
        throw txError;
      } finally {
        await queryRunner.release();
      }

      return result;
    } catch (error: any) {
      logger.error('Error wiping all data', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Reset ALL memory - deletes all messages, clears all AI context, deletes all embeddings
   * This is a complete reset of the entire system's memory
   */
  async resetAllMemory(
    options: ResetMemoryOptions,
  ): Promise<ResetMemoryResult> {
    logger.warn('⚠️ RESET ALL MEMORY REQUESTED - This will delete ALL messages, attendances, and embeddings!', { options });

    const result: ResetMemoryResult = {
      deleted: {
        messages: 0,
        attendances: 0,
        embeddings: 0,
      },
      attendanceIds: [],
    };

    try {
      // Get ALL attendance IDs
      const allAttendances = await this.attendanceRepository.find({
        select: ['id'],
      });
      const allAttendanceIds = allAttendances.map((a) => a.id);

      logger.info('Found all attendances to reset', {
        count: allAttendanceIds.length,
      });

      if (allAttendanceIds.length === 0) {
        logger.warn('No attendances found to reset');
        return result;
      }

      // Use the existing resetMemoryByAttendanceIds method
      return await this.resetMemoryByAttendanceIds(allAttendanceIds, options);
    } catch (error: any) {
      logger.error('Error resetting all memory', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}
