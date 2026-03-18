// @ts-nocheck
import { IWhatsAppAdapter } from '../../domain/interfaces/whatsapp-adapter.interface';
import { WhatsAppAdapterFactory } from '../../infrastructure/adapters/adapter-factory';
import { WhatsAppNumber } from '../../domain/entities/whatsapp-number.entity';
import { ConnectionStatus, WhatsAppAdapterType, UUID } from '../../../../shared/types/common.types';
import { logger } from '../../../../shared/utils/logger';
import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { socketService } from '../../../../shared/infrastructure/socket/socket.service';
import { Attendance } from '../../../attendance/domain/entities/attendance.entity';

/**
 * WhatsApp Manager Service
 * 
 * Manages WhatsApp adapters and connections
 */
export class WhatsAppManagerService {
  private adapters: Map<string, IWhatsAppAdapter> = new Map();

  /**
   * Handle typing/presence updates from WhatsApp
   * Finds the attendance for the client and emits Socket.IO event
   */
  private async handleTypingUpdate(
    whatsappNumberId: string,
    typingData: { from: string; phoneNumber: string; isTyping: boolean }
  ): Promise<void> {
    try {
      logger.info('Handling typing update', {
        whatsappNumberId,
        phoneNumber: typingData.phoneNumber,
        isTyping: typingData.isTyping,
        from: typingData.from,
      });

      // Find active attendance for this client phone number
      // Try to find any attendance (not just active ones) for this client
      const attendanceRepo = AppDataSource.getRepository(Attendance);
      
      // First try to find the most recent attendance
      let attendance = await attendanceRepo.findOne({
        where: {
          clientPhone: typingData.phoneNumber,
          whatsappNumberId: whatsappNumberId as UUID,
        },
        order: {
          createdAt: 'DESC',
        },
      });

      // If not found, try without whatsappNumberId filter (in case of mismatch)
      if (!attendance) {
        logger.debug('No attendance found with whatsappNumberId, trying without it', {
          phoneNumber: typingData.phoneNumber,
          whatsappNumberId,
        });
        
        attendance = await attendanceRepo.findOne({
          where: {
            clientPhone: typingData.phoneNumber,
          },
          order: {
            createdAt: 'DESC',
          },
        });
      }

      if (!attendance) {
        logger.warn('No attendance found for typing update', {
          phoneNumber: typingData.phoneNumber,
          whatsappNumberId,
        });
        return;
      }

      logger.info('Attendance found for typing update', {
        attendanceId: attendance.id,
        clientPhone: attendance.clientPhone,
        sellerId: attendance.sellerId,
      });

      // Emit Socket.IO event for typing update
      const typingEventData = {
        attendanceId: attendance.id,
        clientPhone: typingData.phoneNumber,
        isTyping: typingData.isTyping,
      };

      // Emit to specific rooms based on attendance assignment
      if (attendance.sellerId) {
        logger.info('Emitting typing event to seller room', {
          room: `seller_${attendance.sellerId}`,
          data: typingEventData,
        });
        socketService.emitToRoom(`seller_${attendance.sellerId}`, 'client:typing', typingEventData);
      } else {
        logger.info('Emitting typing event to supervisors room', {
          room: 'supervisors',
          data: typingEventData,
        });
        socketService.emitToRoom('supervisors', 'client:typing', typingEventData);
      }

      // CORREÇÃO: Remover broadcast global para evitar eventos de digitação em chats incorretos
      logger.info('Typing update event emitted to specific rooms only', {
        attendanceId: attendance.id,
        isTyping: typingData.isTyping,
        sellerId: attendance.sellerId,
        room: attendance.sellerId ? `seller_${attendance.sellerId}` : 'supervisors',
      });
    } catch (error: any) {
      logger.error('Error handling typing update', {
        whatsappNumberId,
        phoneNumber: typingData.phoneNumber,
        error: error.message,
      });
    }
  }

  /**
   * Create and connect a WhatsApp adapter for a number
   * Returns QR code if connection requires it
   */
  async connectNumber(whatsappNumber: WhatsAppNumber): Promise<{ qrCode?: string; status: string }> {
    try {
      logger.info('Connecting WhatsApp number', {
        numberId: whatsappNumber.id,
        number: whatsappNumber.number,
        adapterType: whatsappNumber.adapterType,
      });

      // Check if adapter already exists
      let adapter: IWhatsAppAdapter;
      if (this.adapters.has(whatsappNumber.id)) {
        adapter = this.adapters.get(whatsappNumber.id)!;
        if (adapter.isConnected()) {
          logger.info('WhatsApp number already connected, re-registering message callback', {
            numberId: whatsappNumber.id,
          });
          // Re-register callback in case it was lost
          adapter.onMessage(async (message) => {
            logger.info('Received WhatsApp message (existing adapter)', {
              numberId: whatsappNumber.id,
              from: message.from,
              to: message.to,
              messageId: message.id,
            });
            
            try {
              const { messageProcessorService } = await import('../../../message/application/services/message-processor.service');
              await messageProcessorService.processIncomingMessage({
                ...message,
                whatsappNumberId: whatsappNumber.id,
              });
            } catch (error: any) {
              logger.error('Error processing message through message processor', {
                numberId: whatsappNumber.id,
                messageId: message.id,
                error: error.message,
              });
            }
          });

          // Re-register typing callback
          adapter.onTyping(async (typingData) => {
            await this.handleTypingUpdate(whatsappNumber.id, typingData);
          });

          return { status: 'connected', qrCode: undefined };
        }
      } else {
        // Create new adapter
        adapter = WhatsAppAdapterFactory.create({
          numberId: whatsappNumber.id,
          name: whatsappNumber.number,
          adapterType: whatsappNumber.adapterType,
          config: whatsappNumber.config,
        });
      }

      // Register message callback (MUST be before connect() to catch all messages)
      logger.info('Registering message callback before connect', {
        numberId: whatsappNumber.id,
      });
      
      adapter.onMessage(async (message) => {
        logger.info('Received WhatsApp message', {
          numberId: whatsappNumber.id,
          from: message.from,
          to: message.to,
          messageId: message.id,
        });
        
        // Process message through message processor
        // This will create/update attendance and save message
        try {
          const { messageProcessorService } = await import('../../../message/application/services/message-processor.service');
          await messageProcessorService.processIncomingMessage({
            ...message,
            whatsappNumberId: whatsappNumber.id, // Ensure whatsappNumberId is set
          });
        } catch (error: any) {
          logger.error('Error processing message through message processor', {
            numberId: whatsappNumber.id,
            messageId: message.id,
            error: error.message,
          });
        }
      });

      // Register typing callback
      logger.info('Registering typing callback', {
        numberId: whatsappNumber.id,
      });
      
      adapter.onTyping(async (typingData) => {
        await this.handleTypingUpdate(whatsappNumber.id, typingData);
      });

      // Connect (this may return a QR code if needed)
      const connectionResult = await (adapter as any).connect();

      // Store adapter
      this.adapters.set(whatsappNumber.id, adapter);

      // Get QR code from adapter if available
      let qrCode: string | undefined;
      if (connectionResult && connectionResult.qrCode) {
        qrCode = connectionResult.qrCode;
      } else if ((adapter as any).getQrCode) {
        qrCode = (adapter as any).getQrCode() || undefined;
      }

      const status = connectionResult?.status || (adapter.isConnected() ? 'connected' : 'connecting');

      logger.info('WhatsApp number connection result', {
        numberId: whatsappNumber.id,
        number: whatsappNumber.number,
        status,
        hasQrCode: !!qrCode,
      });

      return {
        status,
        qrCode,
      };
    } catch (error: any) {
      logger.error('Failed to connect WhatsApp number', {
        numberId: whatsappNumber.id,
        number: whatsappNumber.number,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Disconnect a WhatsApp adapter for a number
   */
  async disconnectNumber(whatsappNumberId: string): Promise<void> {
    try {
      logger.info('Disconnecting WhatsApp number', {
        numberId: whatsappNumberId,
      });

      const adapter = this.adapters.get(whatsappNumberId);
      if (!adapter) {
        logger.warn('WhatsApp adapter not found', {
          numberId: whatsappNumberId,
        });
        return;
      }

      await adapter.disconnect();
      this.adapters.delete(whatsappNumberId);

      logger.info('WhatsApp number disconnected successfully', {
        numberId: whatsappNumberId,
      });
    } catch (error: any) {
      logger.error('Failed to disconnect WhatsApp number', {
        numberId: whatsappNumberId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get adapter for a WhatsApp number
   */
  getAdapter(whatsappNumberId: string): IWhatsAppAdapter | undefined {
    return this.adapters.get(whatsappNumberId);
  }

  /**
   * Check if a number is connected
   */
  isConnected(whatsappNumberId: string): boolean {
    const adapter = this.adapters.get(whatsappNumberId);
    return adapter ? adapter.isConnected() : false;
  }

  /**
   * Get connection status for a number
   */
  async getConnectionStatus(whatsappNumberId: string): Promise<ConnectionStatus> {
    const adapter = this.adapters.get(whatsappNumberId);
    
    if (!adapter) {
      return ConnectionStatus.DISCONNECTED;
    }

    if (adapter.isConnected()) {
      return ConnectionStatus.CONNECTED;
    }

    // For Python adapter, check status via HTTP
    if (adapter.getType() === 'UNOFFICIAL') {
      // Type assertion to access Python-specific methods
      const pythonAdapter = adapter as any;
      if (pythonAdapter.getStatus) {
        try {
          const status = await pythonAdapter.getStatus();
          return status.connected
            ? ConnectionStatus.CONNECTED
            : ConnectionStatus.CONNECTING;
        } catch (error) {
          return ConnectionStatus.DISCONNECTED;
        }
      }
    }

    return ConnectionStatus.DISCONNECTED;
  }

  /**
   * Handle incoming webhook message
   */
  handleIncomingMessage(whatsappNumberId: string, webhookData: any): void {
    const adapter = this.adapters.get(whatsappNumberId);
    
    if (!adapter) {
      logger.warn('Adapter not found for incoming message', {
        numberId: whatsappNumberId,
      });
      return;
    }

    // Handle message based on adapter type
    if (adapter.getType() === 'UNOFFICIAL') {
      const pythonAdapter = adapter as any;
      if (pythonAdapter.handleIncomingMessage) {
        pythonAdapter.handleIncomingMessage(webhookData);
      }
    }
  }

  /**
   * Reconnect all WhatsApp numbers that were connected before server restart
   * This should be called on server startup
   */
  async reconnectAllNumbers(): Promise<void> {
    try {
      if (!AppDataSource.isInitialized) {
        logger.warn('Database not initialized, skipping auto-reconnect');
        return;
      }

      const whatsappNumberRepo = AppDataSource.getRepository(WhatsAppNumber);
      
      // Find all numbers that were connected (or have credentials saved)
      // Include CONNECTED, UNOFFICIAL (for re-auth), and OFFICIAL (to register adapter for sending)
      const numbersToReconnect = await whatsappNumberRepo.find({
        where: [
          { connectionStatus: ConnectionStatus.CONNECTED, active: true },
          { adapterType: WhatsAppAdapterType.UNOFFICIAL, active: true }, // Try to reconnect unofficial adapters that might have credentials
          { adapterType: WhatsAppAdapterType.OFFICIAL, active: true }, // Register official adapters so webhook-received messages can be replied to
        ],
      });

      logger.info('Auto-reconnecting WhatsApp numbers on startup', {
        numbersCount: numbersToReconnect.length,
      });

      // Reconnect each number (with delay to avoid overwhelming the system)
      for (let i = 0; i < numbersToReconnect.length; i++) {
        const number = numbersToReconnect[i];
        
        // Add delay between reconnections
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        try {
          logger.info('Auto-reconnecting WhatsApp number', {
            numberId: number.id,
            number: number.number,
            adapterType: number.adapterType,
            connectionStatus: number.connectionStatus,
          });

          await this.connectNumber(number);

          logger.info('WhatsApp number auto-reconnected successfully', {
            numberId: number.id,
            number: number.number,
          });
        } catch (error: any) {
          logger.error('Failed to auto-reconnect WhatsApp number', {
            numberId: number.id,
            number: number.number,
            error: error.message,
          });
          // Continue with next number even if one fails
        }
      }

      logger.info('Auto-reconnect completed', {
        totalNumbers: numbersToReconnect.length,
        reconnected: this.adapters.size,
      });
    } catch (error: any) {
      logger.error('Error during auto-reconnect', {
        error: error.message,
        stack: error.stack,
      });
    }
  }
}

// Singleton instance
export const whatsappManagerService = new WhatsAppManagerService();
