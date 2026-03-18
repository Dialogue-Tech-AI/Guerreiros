// @ts-nocheck
import { Router, Request, Response } from 'express';
import { validate as uuidValidate } from 'uuid';
import { validateBody } from '../../../../shared/presentation/middlewares/validation.middleware';
import { authMiddleware } from '../../../../shared/presentation/middlewares/auth.middleware';
import { requireSuperAdmin } from '../../../../shared/presentation/middlewares/permission.middleware';
import { ConnectWhatsAppDto, connectWhatsAppDtoSchema } from '../dto/connect-whatsapp.dto';
import { WebhookMessageDto, webhookMessageDtoSchema } from '../dto/webhook-message.dto';
import { ConnectionConfirmedDto, connectionConfirmedDtoSchema } from '../dto/connection-confirmed.dto';
import { UpdateWhatsAppNumberDto, updateWhatsAppNumberDtoSchema } from '../dto/update-whatsapp-number.dto';
import { whatsappManagerService } from '../../application/services/whatsapp-manager.service';
import {
  normalizeMetaWebhookValueToWhatsAppMessages,
  MetaWebhookPayload,
} from '../../application/services/meta-webhook.normalizer';
import { messageProcessorService } from '../../../message/application/services/message-processor.service';
import { MediaService } from '../../../message/application/services/media.service';
import AppConfig from '../../../../config/app.config';
import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { WhatsAppNumber } from '../../domain/entities/whatsapp-number.entity';
import { WhatsAppAdapterType, ConnectionStatus, UserRole, AttendanceType, WhatsAppNumberType } from '../../../../shared/types/common.types';
import { logger } from '../../../../shared/utils/logger';
import { User } from '../../../auth/domain/entities/user.entity';
import { Attendance } from '../../../attendance/domain/entities/attendance.entity';
import { Message } from '../../../message/domain/entities/message.entity';
import { MessageRead } from '../../../message/domain/entities/message-read.entity';
import { BaileysCredential } from '../../domain/entities/baileys-credential.entity';
import { cache } from '../../../../shared/infrastructure/factories/infrastructure.factory';

export class WhatsAppAdminController {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Webhook endpoint (no auth required, but should be secured in production)
    this.router.post(
      '/webhook',
      validateBody(webhookMessageDtoSchema),
      this.handleWebhook.bind(this)
    );

    // Connection confirmed endpoint (called by Python service when QR code is scanned)
    this.router.post(
      '/connection-confirmed',
      validateBody(connectionConfirmedDtoSchema),
      this.handleConnectionConfirmed.bind(this)
    );

    // Official API webhook (Meta): verification (GET) and messages (POST)
    this.router.get('/webhook/official', this.handleWebhookOfficialVerify.bind(this));
    this.router.post('/webhook/official', this.handleWebhookOfficialMessage.bind(this));

    // Admin endpoints (require Super Admin role)
    this.router.post(
      '/:id/connect',
      authMiddleware,
      requireSuperAdmin,
      validateBody(connectWhatsAppDtoSchema),
      this.connectNumber.bind(this)
    );

    this.router.post(
      '/:id/disconnect',
      authMiddleware,
      requireSuperAdmin,
      this.disconnectNumber.bind(this)
    );

    this.router.get(
      '/:id/status',
      authMiddleware,
      requireSuperAdmin,
      this.getStatus.bind(this)
    );

    // List all WhatsApp numbers
    this.router.get(
      '/',
      authMiddleware,
      requireSuperAdmin,
      this.listNumbers.bind(this)
    );

    // Update WhatsApp number (type and seller)
    this.router.patch(
      '/:id',
      authMiddleware,
      requireSuperAdmin,
      validateBody(updateWhatsAppNumberDtoSchema),
      this.updateNumber.bind(this)
    );

    // Delete WhatsApp number
    this.router.delete(
      '/:id',
      authMiddleware,
      requireSuperAdmin,
      this.deleteNumber.bind(this)
    );

    // Reset entire system (Super Admin only)
    this.router.post(
      '/reset-system',
      authMiddleware,
      requireSuperAdmin,
      this.resetSystem.bind(this)
    );

    // List sellers for assignment
    this.router.get(
      '/sellers/list',
      authMiddleware,
      requireSuperAdmin,
      this.listSellers.bind(this)
    );
  }

  /**
   * Connect a WhatsApp number
   * If number doesn't exist, creates it first
   */
  private async connectNumber(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
      // Validate UUID format
      if (!uuidValidate(id)) {
        res.status(400).json({
          error: 'Invalid UUID format',
          message: 'The provided ID must be a valid UUID',
        });
        return;
      }

      const dto = req.body as ConnectWhatsAppDto;
      const isOfficial =
        dto.adapterType === 'OFFICIAL' ||
        (!!dto.phoneNumberId && !!dto.accessToken);

      // Get WhatsApp number from database
      const whatsappNumberRepo = AppDataSource.getRepository(WhatsAppNumber);
      let whatsappNumber = await whatsappNumberRepo.findOne({
        where: { id },
      });

      if (isOfficial) {
        const phoneNumberId = dto.phoneNumberId ?? '';
        const accessToken = dto.accessToken ?? '';
        if (!phoneNumberId || !accessToken) {
          res.status(400).json({
            error: 'Official adapter requires phoneNumberId and accessToken',
          });
          return;
        }
        const uniqueNumber = `official_${phoneNumberId}_${id.substring(0, 8)}`;
        if (!whatsappNumber) {
          whatsappNumber = whatsappNumberRepo.create({
            id,
            number: uniqueNumber,
            adapterType: WhatsAppAdapterType.OFFICIAL,
            handledBy: AttendanceType.AI,
            numberType: WhatsAppNumberType.UNDEFINED,
            active: true,
            config: {
              name: dto.name,
              phoneNumberId,
              accessToken,
              verifyToken: dto.verifyToken,
              ...(dto.config || {}),
            },
            connectionStatus: ConnectionStatus.DISCONNECTED,
          });
          await whatsappNumberRepo.save(whatsappNumber);
          logger.info('Official WhatsApp number created', { id, phoneNumberId });
        } else {
          whatsappNumber.adapterType = WhatsAppAdapterType.OFFICIAL;
          whatsappNumber.number = uniqueNumber;
          whatsappNumber.config = {
            ...whatsappNumber.config,
            name: dto.name,
            phoneNumberId,
            accessToken,
            verifyToken: dto.verifyToken,
            ...(dto.config || {}),
          };
          await whatsappNumberRepo.save(whatsappNumber);
        }
        const connectionResult = await whatsappManagerService.connectNumber(whatsappNumber);
        whatsappNumber.updateConnectionStatus(ConnectionStatus.CONNECTED);
        await whatsappNumberRepo.save(whatsappNumber);
        res.json({
          success: true,
          message: 'Número oficial conectado com sucesso.',
          numberId: id,
          qrCode: undefined,
          status: connectionResult.status,
        });
        return;
      }

      // Unofficial flow
      if (!whatsappNumber) {
        logger.info('Creating new WhatsApp number', {
          id,
          name: dto.name,
        });
        const uniqueNumber = `${dto.name}_${id.substring(0, 8)}`;
        whatsappNumber = whatsappNumberRepo.create({
          id,
          number: uniqueNumber,
          adapterType: WhatsAppAdapterType.UNOFFICIAL,
          handledBy: AttendanceType.AI,
          numberType: WhatsAppNumberType.UNDEFINED,
          active: true,
          config: {
            ...(dto.config || {}),
            name: dto.name,
          },
          connectionStatus: ConnectionStatus.DISCONNECTED,
        });
        await whatsappNumberRepo.save(whatsappNumber);
        logger.info('WhatsApp number created', { id, number: uniqueNumber });
      }

      if (whatsappNumber.adapterType !== WhatsAppAdapterType.UNOFFICIAL) {
        res.status(400).json({
          error: 'Only unofficial adapters can be connected via this endpoint (use adapterType OFFICIAL with phoneNumberId/accessToken for official).',
        });
        return;
      }

      if (dto.config) {
        whatsappNumber.config = { ...whatsappNumber.config, ...dto.config };
        await whatsappNumberRepo.save(whatsappNumber);
      }

      const connectionResult = await whatsappManagerService.connectNumber(whatsappNumber);
      if (connectionResult.status === 'connected' && !connectionResult.qrCode) {
        whatsappNumber.updateConnectionStatus(ConnectionStatus.CONNECTED);
      } else {
        whatsappNumber.updateConnectionStatus(ConnectionStatus.DISCONNECTED);
      }
      await whatsappNumberRepo.save(whatsappNumber);

      res.json({
        success: true,
        message: connectionResult.status === 'connected'
          ? 'WhatsApp number connected successfully'
          : 'Conexão iniciada. Escaneie o QR code abaixo.',
        numberId: id,
        qrCode: connectionResult.qrCode,
        status: connectionResult.status,
      });
    } catch (error: any) {
      logger.error('Error connecting WhatsApp number', {
        error: error.message,
        stack: error.stack,
        numberId: id,
      });

      // Provide more user-friendly error messages
      let errorMessage = error.message;
      if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT') || error.message.includes('não está disponível')) {
        errorMessage = 'Serviço Python WhatsApp não está disponível. Por favor, inicie o serviço Python antes de conectar números.';
      }

      res.status(500).json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * Disconnect a WhatsApp number
   */
  private async disconnectNumber(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Get WhatsApp number from database
      const whatsappNumberRepo = AppDataSource.getRepository(WhatsAppNumber);
      const whatsappNumber = await whatsappNumberRepo.findOne({
        where: { id },
      });

      if (!whatsappNumber) {
        res.status(404).json({ error: 'WhatsApp number not found' });
        return;
      }

      // Disconnect
      await whatsappManagerService.disconnectNumber(id);

      // Update connection status
      whatsappNumber.updateConnectionStatus(ConnectionStatus.DISCONNECTED);
      await whatsappNumberRepo.save(whatsappNumber);

      res.json({
        success: true,
        message: 'WhatsApp number disconnected successfully',
        numberId: id,
      });
    } catch (error: any) {
      logger.error('Error disconnecting WhatsApp number', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get connection status for a WhatsApp number
   */
  private async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Get WhatsApp number from database
      const whatsappNumberRepo = AppDataSource.getRepository(WhatsAppNumber);
      const whatsappNumber = await whatsappNumberRepo.findOne({
        where: { id },
      });

      if (!whatsappNumber) {
        res.status(404).json({ error: 'WhatsApp number not found' });
        return;
      }

      // Get connection status
      const status = await whatsappManagerService.getConnectionStatus(id);
      const isConnected = whatsappManagerService.isConnected(id);

      res.json({
        numberId: id,
        status,
        connected: isConnected,
        adapterType: whatsappNumber.adapterType,
      });
    } catch (error: any) {
      logger.error('Error getting WhatsApp status', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Handle webhook messages from Python service
   */
  private async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const dto = req.body as WebhookMessageDto;

      logger.info('Received webhook message', {
        from: dto.from_number,
        to: dto.to_number,
        messageId: dto.message_id,
      });

      // Find WhatsApp number by phone number
      const whatsappNumberRepo = AppDataSource.getRepository(WhatsAppNumber);
      const whatsappNumber = await whatsappNumberRepo.findOne({
        where: { number: dto.to_number },
      });

      if (!whatsappNumber) {
        logger.warn('WhatsApp number not found for webhook', {
          to: dto.to_number,
        });
        res.status(404).json({ error: 'WhatsApp number not found' });
        return;
      }

      // Handle incoming message
      whatsappManagerService.handleIncomingMessage(whatsappNumber.id, dto);

      // TODO: Process message through message module
      // This will create/update attendance, route message, etc.

      res.json({ success: true, message: 'Webhook received' });
    } catch (error: any) {
      logger.error('Error handling webhook', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /webhook/official - Meta webhook verification
   * Usa o mesmo verify token: env (WHATSAPP_META_VERIFY_TOKEN) ou, se vazio, o config.verifyToken do primeiro número oficial (o que o usuário define no frontend).
   */
  private async handleWebhookOfficialVerify(req: Request, res: Response): Promise<void> {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    let verifyToken =
      AppConfig.whatsappOfficial?.verifyToken ||
      process.env.WHATSAPP_META_VERIFY_TOKEN ||
      '';
    if (!verifyToken) {
      const whatsappNumberRepo = AppDataSource.getRepository(WhatsAppNumber);
      const firstOfficial = await whatsappNumberRepo.findOne({
        where: { adapterType: WhatsAppAdapterType.OFFICIAL, active: true },
      });
      if (firstOfficial?.config?.verifyToken) {
        verifyToken = String(firstOfficial.config.verifyToken);
      }
    }
    if (mode === 'subscribe' && token === verifyToken && challenge) {
      logger.info('Meta webhook verified', { mode });
      res.status(200).send(challenge);
    } else {
      logger.warn('Meta webhook verification failed', { mode, tokenPresent: !!token });
      res.status(403).end();
    }
  }

  /**
   * POST /webhook/official - Meta webhook incoming messages
   * Respond 200 immediately; process messages in background.
   */
  private async handleWebhookOfficialMessage(req: Request, res: Response): Promise<void> {
    res.status(200).send();
    const payload = req.body as MetaWebhookPayload;
    try {
      if (!payload?.entry?.length) return;
      const whatsappNumberRepo = AppDataSource.getRepository(WhatsAppNumber);
      const officialNumbers = await whatsappNumberRepo.find({
        where: { adapterType: WhatsAppAdapterType.OFFICIAL, active: true },
      });
      for (const entry of payload.entry) {
        for (const change of entry.changes ?? []) {
          const value = change.value;
          const phoneNumberId = value?.metadata?.phone_number_id;
          if (!phoneNumberId || !value?.messages?.length) continue;
          const ourNumber = officialNumbers.find((n) => n.config?.phoneNumberId === phoneNumberId);
          if (!ourNumber) {
            logger.warn('Meta webhook: no WhatsApp number for phone_number_id', {
              phone_number_id: phoneNumberId,
            });
            continue;
          }
          try {
            await whatsappManagerService.connectNumber(ourNumber);
          } catch {
            // Adapter may already be registered
          }
          const messages = normalizeMetaWebhookValueToWhatsAppMessages(value, ourNumber.id);
          const mediaService = new MediaService();
          const accessToken = ourNumber.config?.accessToken as string | undefined;
          for (const msg of messages) {
            try {
              if (msg.mediaUrl && msg.mediaType && accessToken) {
                const stored = await mediaService.downloadAndStoreOfficialApiMedia(
                  msg.mediaUrl,
                  accessToken,
                  ourNumber.id,
                  msg.id,
                  msg.mediaType
                );
                if (stored) {
                  msg.mediaUrl = stored.mediaUrl;
                  logger.info('Official webhook: media resolved and stored', {
                    messageId: msg.id,
                    mediaType: msg.mediaType,
                  });
                } else {
                  // Download falhou (401, 404, etc.): não usar o ID da Meta como path do MinIO
                  msg.mediaUrl = undefined;
                  logger.warn('Official webhook: media download failed - clearing mediaUrl (check Meta access token if 401)', {
                    messageId: msg.id,
                    mediaType: msg.mediaType,
                  });
                }
              }
              await messageProcessorService.processIncomingMessage(msg);
            } catch (err: any) {
              logger.error('Error processing official webhook message', {
                messageId: msg.id,
                error: err?.message,
              });
            }
          }
        }
      }
    } catch (error: any) {
      logger.error('Error in official webhook handler', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Handle connection confirmed from Python service
   * This is called when QR code is scanned and WhatsApp is connected
   */
  private async handleConnectionConfirmed(req: Request, res: Response): Promise<void> {
    try {
      const dto = req.body as ConnectionConfirmedDto;

      logger.info('Connection confirmed', {
        numberId: dto.number_id,
        whatsappNumber: dto.whatsapp_number,
        connected: dto.connected,
      });

      // Get WhatsApp number from database
      const whatsappNumberRepo = AppDataSource.getRepository(WhatsAppNumber);
      const whatsappNumber = await whatsappNumberRepo.findOne({
        where: { id: dto.number_id },
      });

      if (!whatsappNumber) {
        logger.warn('WhatsApp number not found for connection confirmed', {
          numberId: dto.number_id,
        });
        res.status(404).json({ error: 'WhatsApp number not found' });
        return;
      }

      // Update WhatsApp number with real number and connection status
      whatsappNumber.number = dto.whatsapp_number;
      whatsappNumber.updateConnectionStatus(
        dto.connected ? ConnectionStatus.CONNECTED : ConnectionStatus.DISCONNECTED
      );
      await whatsappNumberRepo.save(whatsappNumber);

      logger.info('WhatsApp number updated with real number', {
        numberId: dto.number_id,
        whatsappNumber: dto.whatsapp_number,
        status: dto.connected ? 'CONNECTED' : 'DISCONNECTED',
      });

      res.json({
        success: true,
        message: 'Connection confirmed and number updated',
        numberId: dto.number_id,
      });
    } catch (error: any) {
      logger.error('Error handling connection confirmed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * List all WhatsApp numbers
   */
  private async listNumbers(req: Request, res: Response): Promise<void> {
    try {
      const whatsappNumberRepo = AppDataSource.getRepository(WhatsAppNumber);
      
      const numbers = await whatsappNumberRepo.find({
        relations: ['seller'],
        order: {
          createdAt: 'DESC',
        },
      });

      res.json({
        success: true,
        numbers: numbers.map((num) => ({
          id: num.id,
          number: num.number,
          adapterType: num.adapterType,
          handledBy: num.handledBy,
          numberType: num.numberType,
          active: num.active,
          connectionStatus: num.connectionStatus,
          sellerId: num.sellerId,
          seller: num.seller ? {
            id: num.seller.id,
            name: num.seller.name,
            email: num.seller.email,
          } : null,
          config: num.config || {},
          createdAt: num.createdAt,
          updatedAt: num.updatedAt,
        })),
      });
    } catch (error: any) {
      logger.error('Error listing WhatsApp numbers', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Update WhatsApp number (type and seller assignment)
   */
  private async updateNumber(req: Request, res: Response): Promise<void> {
    const id = req.params.id;
    try {
      const dto = req.body as UpdateWhatsAppNumberDto;

      const whatsappNumberRepo = AppDataSource.getRepository(WhatsAppNumber);
      const whatsappNumber = await whatsappNumberRepo.findOne({
        where: { id },
        relations: ['seller'],
      });

      if (!whatsappNumber) {
        res.status(404).json({ error: 'WhatsApp number not found' });
        return;
      }

      // Update number type
      if (dto.numberType !== undefined) {
        whatsappNumber.numberType = dto.numberType;
        
        // If changing to PRIMARY or UNDEFINED, remove seller
        if (dto.numberType === WhatsAppNumberType.PRIMARY || dto.numberType === WhatsAppNumberType.UNDEFINED) {
          whatsappNumber.sellerId = null;
        }
      }

      // Update seller (only if SECONDARY and sellerId is explicitly provided)
      // Check current number type (might have been updated above)
      const currentType = dto.numberType !== undefined ? dto.numberType : whatsappNumber.numberType;
      
      // Only process sellerId if it's explicitly provided in the request
      if (dto.sellerId !== undefined) {
        if (currentType === WhatsAppNumberType.SECONDARY) {
          if (dto.sellerId) {
            // Verify seller exists
            const userRepo = AppDataSource.getRepository(User);
            const seller = await userRepo.findOne({
              where: { id: dto.sellerId },
            });

            if (!seller) {
              res.status(404).json({ error: 'Seller not found' });
              return;
            }

            whatsappNumber.sellerId = dto.sellerId;
          } else {
            // Allow null to remove seller assignment (but SECONDARY requires seller)
            // If trying to set null on SECONDARY, that's an error
            res.status(400).json({
              error: 'SECONDARY number type requires a seller. Select a seller or change numberType to PRIMARY or UNDEFINED.',
            });
            return;
          }
        } else {
          // If trying to assign seller to PRIMARY or UNDEFINED, that's an error
          res.status(400).json({
            error: 'Cannot assign seller to PRIMARY or UNDEFINED number. Change numberType to SECONDARY first.',
          });
          return;
        }
      }

      await whatsappNumberRepo.save(whatsappNumber);

      // Reload with relations
      const updatedNumber = await whatsappNumberRepo.findOne({
        where: { id },
        relations: ['seller'],
      });

      res.json({
        success: true,
        message: 'WhatsApp number updated successfully',
        number: {
          id: updatedNumber!.id,
          number: updatedNumber!.number,
          adapterType: updatedNumber!.adapterType,
          handledBy: updatedNumber!.handledBy,
          numberType: updatedNumber!.numberType,
          active: updatedNumber!.active,
          connectionStatus: updatedNumber!.connectionStatus,
          sellerId: updatedNumber!.sellerId,
          seller: updatedNumber!.seller ? {
            id: updatedNumber!.seller.id,
            name: updatedNumber!.seller.name,
            email: updatedNumber!.seller.email,
          } : null,
          createdAt: updatedNumber!.createdAt,
          updatedAt: updatedNumber!.updatedAt,
        },
      });
    } catch (error: any) {
      logger.error('Error updating WhatsApp number', {
        error: error.message,
        stack: error.stack,
        numberId: id ?? 'unknown',
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Delete WhatsApp number
   */
  private async deleteNumber(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { force } = req.query; // Optional force parameter

      const whatsappNumberRepo = AppDataSource.getRepository(WhatsAppNumber);
      const attendanceRepo = AppDataSource.getRepository(Attendance);

      const whatsappNumber = await whatsappNumberRepo.findOne({
        where: { id },
      });

      if (!whatsappNumber) {
        res.status(404).json({ error: 'WhatsApp number not found' });
        return;
      }

      // Check if there are attendances related to this WhatsApp number
      const attendancesCount = await attendanceRepo.count({
        where: { whatsappNumberId: id },
      });

      if (attendancesCount > 0 && !force) {
        // Get count by state for better error message
        const openAttendances = await attendanceRepo.count({
          where: { whatsappNumberId: id, state: 'OPEN' },
        });
        const inProgressAttendances = await attendanceRepo.count({
          where: { whatsappNumberId: id, state: 'IN_PROGRESS' },
        });
        const finishedAttendances = await attendanceRepo.count({
          where: { whatsappNumberId: id, state: 'FINISHED' },
        });

        res.status(400).json({
          error: 'Cannot delete WhatsApp number with related attendances',
          message: `Este número WhatsApp possui ${attendancesCount} atendimento(s) relacionado(s) e não pode ser deletado.`,
          details: {
            total: attendancesCount,
            open: openAttendances,
            inProgress: inProgressAttendances,
            finished: finishedAttendances,
          },
          suggestion: 'Finalize ou remova os atendimentos relacionados antes de deletar o número, ou use o parâmetro force=true para forçar a deleção (isso removerá todos os atendimentos relacionados).',
        });
        return;
      }

      // If force=true, delete related attendances first
      if (force && attendancesCount > 0) {
        logger.warn('Force deleting WhatsApp number with related attendances', {
          numberId: id,
          attendancesCount,
        });

        // Delete all related attendances (messages will be cascade deleted)
        await attendanceRepo.delete({ whatsappNumberId: id });

        logger.info('Related attendances deleted', {
          numberId: id,
          deletedCount: attendancesCount,
        });
      }

      // Disconnect if connected
      if (whatsappNumber.connectionStatus === ConnectionStatus.CONNECTED) {
        try {
          await whatsappManagerService.disconnectNumber(id);
        } catch (error) {
          logger.warn('Error disconnecting number before deletion', {
            error: error instanceof Error ? error.message : String(error),
            numberId: id,
          });
          // Continue with deletion even if disconnect fails
        }
      }

      // Delete from database
      await whatsappNumberRepo.remove(whatsappNumber);

      logger.info('WhatsApp number deleted', {
        numberId: id,
        number: whatsappNumber.number,
        attendancesDeleted: force ? attendancesCount : 0,
      });

      res.json({
        success: true,
        message: 'WhatsApp number deleted successfully',
        attendancesDeleted: force ? attendancesCount : 0,
      });
    } catch (error: any) {
      logger.error('Error deleting WhatsApp number', {
        error: error.message,
        stack: error.stack,
        numberId: req.params.id,
      });

      // Check if it's a foreign key constraint error
      if (error.message?.includes('foreign key constraint') || error.code === '23503') {
        res.status(400).json({
          error: 'Cannot delete WhatsApp number',
          message: 'Este número WhatsApp possui atendimentos relacionados e não pode ser deletado. Finalize ou remova os atendimentos antes de deletar o número.',
        });
        return;
      }

      res.status(500).json({ error: error.message });
    }
  }

  /**
   * List all sellers for assignment
   */
  /**
   * Reset entire system - clears all data, connections, cache, etc.
   * WARNING: This is a destructive operation that will delete ALL data!
   */
  private async resetSystem(req: Request, res: Response): Promise<void> {
    try {
      const currentUser = (req as any).user as User;
      
      logger.warn('System reset initiated', {
        userId: currentUser.id,
        userEmail: currentUser.email,
      });

      // Step 1: Disconnect all WhatsApp connections
      logger.info('Disconnecting all WhatsApp connections...');
      const whatsappNumberRepo = AppDataSource.getRepository(WhatsAppNumber);
      const allNumbers = await whatsappNumberRepo.find();
      
      for (const number of allNumbers) {
        try {
          await whatsappManagerService.disconnectNumber(number.id);
        } catch (error: any) {
          logger.warn('Error disconnecting WhatsApp number during reset', {
            numberId: number.id,
            error: error.message,
          });
        }
      }

      // Step 2: Clear Redis cache
      logger.info('Clearing Redis cache...');
      try {
        await cache.clear();
        logger.info('Redis cache cleared successfully');
      } catch (error: any) {
        logger.error('Error clearing Redis cache', {
          error: error.message,
        });
      }

      // Step 3: Delete all data from database (in correct order to respect foreign keys)
      logger.info('Deleting all data from database...');
      const queryRunner = AppDataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // Delete in order to respect foreign key constraints
        await queryRunner.query('DELETE FROM message_reads');
        await queryRunner.query('DELETE FROM messages');
        await queryRunner.query('DELETE FROM attendances');
        await queryRunner.query('DELETE FROM baileys_credentials');
        await queryRunner.query('DELETE FROM whatsapp_numbers');
        
        // Delete all users EXCEPT the current super admin
        await queryRunner.query('DELETE FROM users WHERE id != $1', [currentUser.id]);
        
        // Reset sequences (optional, but good practice)
        await queryRunner.query('ALTER SEQUENCE IF EXISTS users_id_seq RESTART WITH 1');
        
        await queryRunner.commitTransaction();
        logger.info('All data deleted from database successfully');
      } catch (error: any) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }

      logger.info('System reset completed successfully', {
        userId: currentUser.id,
      });

      res.json({
        success: true,
        message: 'Sistema resetado com sucesso. Todos os dados foram apagados.',
      });
    } catch (error: any) {
      logger.error('Error resetting system', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  private async listSellers(req: Request, res: Response): Promise<void> {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const userRepo = AppDataSource.getRepository(User);
      
      const sellers = await userRepo.find({
        where: { role: UserRole.SELLER, active: true },
        select: ['id', 'name', 'email'],
        order: {
          name: 'ASC',
        },
      });

      res.json({
        success: true,
        sellers: sellers,
      });
    } catch (error: any) {
      logger.error('Error listing sellers', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }
}
