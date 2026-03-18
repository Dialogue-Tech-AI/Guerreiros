// @ts-nocheck
import axios, { AxiosInstance } from 'axios';
import {
  IWhatsAppAdapter,
  WhatsAppMessage,
} from '../../../domain/interfaces/whatsapp-adapter.interface';
import { logger } from '../../../../../shared/utils/logger';

interface PythonServiceConfig {
  baseUrl: string;
  numberId: string;
  name: string;
}

interface ConnectionResponse {
  number_id: string;
  status: string;
  qr_code?: string;
  message: string;
}

interface StatusResponse {
  number_id: string;
  status: string;
  connected: boolean;
  last_check: string;
}

interface SendMessageResponse {
  success: boolean;
  message_id: string;
  to: string;
  message: string;
}

/**
 * Python WhatsApp Adapter
 * 
 * This adapter communicates with a Python FastAPI service
 * that manages WhatsApp connections using unofficial APIs
 */
export class PythonWhatsAppAdapter implements IWhatsAppAdapter {
  private readonly httpClient: AxiosInstance;
  private readonly numberId: string;
  private readonly name: string;
  private connected: boolean = false;
  private messageCallbacks: Array<(message: WhatsAppMessage) => void> = [];

  constructor(config: PythonServiceConfig) {
    this.numberId = config.numberId;
    this.name = config.name;
    
    this.httpClient = axios.create({
      baseURL: config.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    logger.info('PythonWhatsAppAdapter initialized', {
      numberId: this.numberId,
      baseUrl: config.baseUrl,
    });
  }

  private qrCode: string | null = null;

  async connect(): Promise<{ qrCode?: string; status: string }> {
    try {
      logger.info('Connecting to WhatsApp via Python service', {
        numberId: this.numberId,
      });

      const response = await this.httpClient.post<ConnectionResponse>('/connect', {
        number_id: this.numberId,
        name: this.name,
      });

      this.qrCode = response.data.qr_code || null;

      // If there's a QR code, status must be "connecting" (not "connected")
      // Only set as "connected" when QR code is actually scanned
      if (this.qrCode) {
        logger.info('WhatsApp connection initiated - QR code generated', {
          numberId: this.numberId,
          qrCode: true,
          message: response.data.message,
        });
        
        // Return "connecting" status with QR code
        // Frontend will poll until connection is confirmed
        return {
          status: 'connecting',
          qrCode: this.qrCode,
        };
      } else if (response.data.status === 'connected') {
        // Only return "connected" if there's no QR code (already connected)
        this.connected = true;
        logger.info('WhatsApp already connected', {
          numberId: this.numberId,
        });
        return { status: 'connected' };
      } else {
        throw new Error(`Connection failed: ${response.data.message}`);
      }
    } catch (error: any) {
      logger.error('Failed to connect WhatsApp', {
        numberId: this.numberId,
        error: error.message,
        response: error.response?.data,
      });
      
      // Provide more detailed error message
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        throw new Error('Serviço Python WhatsApp não está disponível. Verifique se o serviço está rodando na porta 5000.');
      }
      
      throw error;
    }
  }

  getQrCode(): string | null {
    return this.qrCode;
  }

  async disconnect(): Promise<void> {
    try {
      logger.info('Disconnecting WhatsApp', {
        numberId: this.numberId,
      });

      await this.httpClient.post(`/disconnect/${this.numberId}`);
      this.connected = false;

      logger.info('WhatsApp disconnected successfully', {
        numberId: this.numberId,
      });
    } catch (error: any) {
      logger.error('Failed to disconnect WhatsApp', {
        numberId: this.numberId,
        error: error.message,
      });
      throw error;
    }
  }

  async sendTyping(to: string, isTyping: boolean): Promise<void> {
    // Python WhatsApp service doesn't support typing indicator yet
    // This is a no-op for now - typing is handled by Baileys adapter
    logger.debug('Typing indicator requested (not supported by Python WhatsApp service)', {
      numberId: this.numberId,
      to,
      isTyping,
    });
  }

  async sendMessage(to: string, message: string, senderName?: string): Promise<void> {
    if (!this.connected) {
      throw new Error('WhatsApp is not connected');
    }

    try {
      // Add sender name to message if provided
      const finalMessage = senderName ? `*${senderName}:*\n${message}` : message;
      
      logger.info('Sending WhatsApp message', {
        numberId: this.numberId,
        to,
        messageLength: finalMessage.length,
        senderName: senderName || 'none',
      });

      const response = await this.httpClient.post<SendMessageResponse>(
        '/send-message',
        {
          number_id: this.numberId,
          to,
          message: finalMessage,
        }
      );

      if (!response.data.success) {
        throw new Error('Failed to send message');
      }

      logger.info('WhatsApp message sent successfully', {
        numberId: this.numberId,
        to,
        messageId: response.data.message_id,
      });
    } catch (error: any) {
      logger.error('Failed to send WhatsApp message', {
        numberId: this.numberId,
        to,
        error: error.message,
      });
      throw error;
    }
  }

  async sendMedia(to: string, mediaUrl: string, caption?: string): Promise<void> {
    // TODO: Implement media sending via Python service
    // For now, send as text message with URL
    const message = caption
      ? `${caption}\n${mediaUrl}`
      : mediaUrl;
    
    await this.sendMessage(to, message);
  }

  onTyping(callback: (data: { from: string; phoneNumber: string; isTyping: boolean }) => void): void {
    // Python WhatsApp service doesn't support typing indicator yet
    // This is a no-op for now
    logger.debug('Typing callback registration requested (not supported by Python WhatsApp service)', {
      numberId: this.numberId,
    });
  }

  onMessage(callback: (message: WhatsAppMessage) => void): void {
    this.messageCallbacks.push(callback);
    logger.debug('Message callback registered', {
      numberId: this.numberId,
      callbacksCount: this.messageCallbacks.length,
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  getType(): 'UNOFFICIAL' {
    return 'UNOFFICIAL';
  }

  /**
   * Handle incoming webhook message from Python service
   * This is called by the webhook handler in the controller
   */
  handleIncomingMessage(webhookData: {
    from_number: string;
    to_number: string;
    message: string;
    message_id: string;
    timestamp: string;
    message_type?: string;
    media_url?: string;
  }): void {
    // Skip messages from status broadcast
    if (webhookData.from_number === 'status@broadcast') {
      logger.debug('Ignoring status broadcast message', {
        numberId: this.numberId,
      });
      return;
    }

    // IGNORE 100% OF GROUP MESSAGES
    // Groups have the format: XXXXXXXX@g.us
    if (webhookData.from_number.endsWith('@g.us')) {
      logger.info('Ignoring group message', {
        numberId: this.numberId,
        from: webhookData.from_number,
        messageId: webhookData.message_id,
      });
      return;
    }

    const whatsappMessage: WhatsAppMessage = {
      id: webhookData.message_id,
      from: webhookData.from_number,
      to: webhookData.to_number,
      text: webhookData.message,
      mediaUrl: webhookData.media_url,
      mediaType: webhookData.message_type,
      timestamp: new Date(webhookData.timestamp),
    };

    // Notify all registered callbacks
    this.messageCallbacks.forEach((callback) => {
      try {
        callback(whatsappMessage);
      } catch (error: any) {
        logger.error('Error in message callback', {
          numberId: this.numberId,
          error: error.message,
        });
      }
    });

    logger.info('Incoming WhatsApp message processed', {
      numberId: this.numberId,
      from: webhookData.from_number,
      messageId: webhookData.message_id,
    });
  }

  /**
   * Poll connection status until connected
   */
  private async pollConnectionStatus(maxAttempts: number = 60): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await this.httpClient.get<StatusResponse>(
          `/status/${this.numberId}`
        );

        if (response.data.connected) {
          this.connected = true;
          logger.info('WhatsApp connection confirmed', {
            numberId: this.numberId,
          });
          return;
        }

        // Wait 2 seconds before next poll
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error: any) {
        logger.warn('Error polling connection status', {
          numberId: this.numberId,
          attempt: i + 1,
          error: error.message,
        });
      }
    }

    throw new Error('Connection timeout: WhatsApp did not connect within expected time');
  }

  /**
   * Get connection status from Python service
   */
  async getStatus(): Promise<StatusResponse> {
    try {
      const response = await this.httpClient.get<StatusResponse>(
        `/status/${this.numberId}`
      );
      this.connected = response.data.connected;
      return response.data;
    } catch (error: any) {
      logger.error('Failed to get connection status', {
        numberId: this.numberId,
        error: error.message,
      });
      throw error;
    }
  }
}
