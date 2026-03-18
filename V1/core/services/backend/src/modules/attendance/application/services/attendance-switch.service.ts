import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { Attendance } from '../../domain/entities/attendance.entity';
import { OperationalState } from '../../../../shared/types/common.types';
import { logger } from '../../../../shared/utils/logger';
import type { UUID } from '../../../../shared/types/common.types';

/**
 * Serviço de troca de atendimento ativo no meio da conversa.
 * Marca o atendimento atual como AGUARDANDO_CLIENTE e o novo como EM_ATENDIMENTO.
 */
export class AttendanceSwitchService {
  async switchActive(
    clientPhone: string,
    whatsappNumberId: UUID,
    currentAttendanceId: UUID,
    newAttendanceId: UUID
  ): Promise<{ ok: boolean; error?: string }> {
    const repo = AppDataSource.getRepository(Attendance);
    const current = await repo.findOne({
      where: {
        id: currentAttendanceId,
        clientPhone,
        whatsappNumberId,
      },
    });
    if (!current || current.operationalState === OperationalState.FECHADO_OPERACIONAL) {
      return { ok: false, error: 'Current attendance not found or already closed' };
    }
    const next = await repo.findOne({
      where: {
        id: newAttendanceId,
        clientPhone,
        whatsappNumberId,
      },
    });
    if (!next || next.operationalState === OperationalState.FECHADO_OPERACIONAL) {
      return { ok: false, error: 'New attendance not found or closed' };
    }
    await repo.update(
      { id: currentAttendanceId },
      { operationalState: OperationalState.AGUARDANDO_CLIENTE, updatedAt: new Date() }
    );
    await repo.update(
      { id: newAttendanceId },
      { operationalState: OperationalState.EM_ATENDIMENTO, updatedAt: new Date() }
    );
    logger.info('Attendance switch applied', {
      currentAttendanceId,
      newAttendanceId,
      clientPhone,
    });
    return { ok: true };
  }
}
