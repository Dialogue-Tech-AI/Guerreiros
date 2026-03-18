// @ts-nocheck
import {
  IWhatsAppAdapter,
  WhatsAppMessage,
} from '../../../domain/interfaces/whatsapp-adapter.interface';
import { logger } from '../../../../../shared/utils/logger';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode';
import { EventEmitter } from 'events';
import axios from 'axios';

interface WhatsAppWebJSConfig {
  numberId: string;
  name: string;
  dataPath?: string;
}

/**
 * WhatsApp Web.js Adapter
 * 
 * This adapter uses whatsapp-web.js library to connect to WhatsApp Web
 * and generate real QR codes that can be scanned by the mobile app
 */
export class WhatsAppWebJSAdapter implements IWhatsAppAdapter {
  private readonly numberId: string;
  private readonly name: string;
  private client: Client | null = null;
  private connected: boolean = false;
  private qrCode: string | null = null;
  private messageCallbacks: Array<(message: WhatsAppMessage) => void> = [];
  private qrCodeEmitter: EventEmitter = new EventEmitter();
  private dataPath: string;

  constructor(config: WhatsAppWebJSConfig) {
    this.numberId = config.numberId;
    this.name = config.name;
    this.dataPath = config.dataPath || `./.wwebjs_auth/${this.numberId}`;

    logger.info('WhatsAppWebJSAdapter initialized', {
      numberId: this.numberId,
      dataPath: this.dataPath,
    });
  }

  async connect(): Promise<{ qrCode?: string; status: string }> {
    try {
      logger.info('Connecting to WhatsApp via whatsapp-web.js', {
        numberId: this.numberId,
      });

      // Create WhatsApp client with LocalAuth for session persistence
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: this.numberId,
          dataPath: this.dataPath,
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
          ],
        },
      });

      // Set up event handlers BEFORE initializing
      this.setupEventHandlers();

      // Initialize client (this will trigger QR code generation if needed)
      await this.client.initialize();

      // Wait for QR code or connection (with timeout)
      // QR code is generated asynchronously via event, so we wait a bit
      const qrCode = await this.waitForQrCode(5000);
      
      if (qrCode) {
        logger.info('QR code received, returning to frontend', {
          numberId: this.numberId,
        });
        return {
          status: 'connecting',
          qrCode: qrCode,
        };
      }

      // If no QR code after timeout, check if already authenticated
      if (this.client.info && this.connected) {
        logger.info('WhatsApp already authenticated', {
          numberId: this.numberId,
        });
        return { status: 'connected' };
      }

      // Still waiting for QR code or connection
      logger.info('Waiting for QR code or authentication', {
        numberId: this.numberId,
      });
      return { status: 'connecting' };
    } catch (error: any) {
      logger.error('Failed to connect WhatsApp via whatsapp-web.js', {
        numberId: this.numberId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    // QR code event
    this.client.on('qr', async (qr: string) => {
      logger.info('QR code generated', {
        numberId: this.numberId,
      });

      try {
        // Convert QR string to data URL image
        const qrCodeDataUrl = await qrcode.toDataURL(qr, {
          width: 450,
          margin: 4,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });

        this.qrCode = qrCodeDataUrl;
        this.qrCodeEmitter.emit('qr', qrCodeDataUrl);

        logger.info('QR code converted to image', {
          numberId: this.numberId,
        });
      } catch (error: any) {
        logger.error('Error converting QR code to image', {
          numberId: this.numberId,
          error: error.message,
        });
      }
    });

    // Ready event (authenticated and ready)
    this.client.on('ready', async () => {
      logger.info('WhatsApp client ready', {
        numberId: this.numberId,
      });

      this.connected = true;
      this.qrCode = null;

      // Get WhatsApp number from client info
      const clientInfo = this.client?.info;
      if (clientInfo?.wid) {
        const whatsappNumber = clientInfo.wid.user;
        logger.info('WhatsApp number obtained', {
          numberId: this.numberId,
          whatsappNumber,
        });

        // Notify backend about connection
        await this.notifyBackendConnection(whatsappNumber);
      }
    });

    // Authentication failure
    this.client.on('auth_failure', (msg: string) => {
      logger.error('WhatsApp authentication failure', {
        numberId: this.numberId,
        message: msg,
      });
      this.connected = false;
      this.qrCode = null;
    });

    // Disconnected
    this.client.on('disconnected', (reason: string) => {
      logger.warn('WhatsApp disconnected', {
        numberId: this.numberId,
        reason,
      });
      this.connected = false;
      this.qrCode = null;
    });

    // Incoming messages
    this.client.on('message', async (message: Message) => {
      await this.handleIncomingMessage(message);
    });
  }

  private async handleIncomingMessage(message: Message): Promise<void> {
    try {
      // Skip messages from status broadcast
      if (message.from === 'status@broadcast') {
        logger.debug('Ignoring status broadcast message', {
          numberId: this.numberId,
        });
        return;
      }

      // IGNORE 100% OF GROUP MESSAGES
      // Groups have the format: XXXXXXXX@g.us
      if (message.from.endsWith('@g.us')) {
        logger.info('Ignoring group message', {
          numberId: this.numberId,
          from: message.from,
          messageId: message.id._serialized,
        });
        return;
      }

      const whatsappMessage: WhatsAppMessage = {
        id: message.id._serialized,
        from: message.from,
        to: message.to,
        text: message.body,
        timestamp: new Date(message.timestamp * 1000),
        mediaUrl: message.hasMedia ? await message.downloadMedia().then(m => m.data) : undefined,
        mediaType: message.hasMedia ? message.type : undefined,
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
        from: message.from,
        messageId: message.id._serialized,
      });
    } catch (error: any) {
      logger.error('Error handling incoming message', {
        numberId: this.numberId,
        error: error.message,
      });
    }
  }

  private async notifyBackendConnection(whatsappNumber: string): Promise<void> {
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
      const connectionUrl = `${backendUrl}/api/whatsapp/connection-confirmed`;

      await axios.post(connectionUrl, {
        number_id: this.numberId,
        whatsapp_number: whatsappNumber,
        connected: true,
      });

      logger.info('Backend notified of WhatsApp connection', {
        numberId: this.numberId,
        whatsappNumber,
      });
    } catch (error: any) {
      logger.error('Error notifying backend of connection', {
        numberId: this.numberId,
        error: error.message,
      });
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

      if (this.client) {
        await this.client.destroy();
        this.client = null;
      }

      this.connected = false;
      this.qrCode = null;

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
    // WhatsApp Web.js doesn't have direct typing indicator support
    // This is a no-op for now - typing is handled by Baileys adapter
    logger.debug('Typing indicator requested (not supported by whatsapp-web.js)', {
      numberId: this.numberId,
      to,
      isTyping,
    });
  }

  async sendMessage(to: string, message: string, senderName?: string): Promise<void> {
    if (!this.connected || !this.client) {
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

      await this.client.sendMessage(to, finalMessage);

      logger.info('WhatsApp message sent successfully', {
        numberId: this.numberId,
        to,
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
    if (!this.connected || !this.client) {
      throw new Error('WhatsApp is not connected');
    }

    try {
      const { MessageMedia } = require('whatsapp-web.js');
      const media = await MessageMedia.fromUrl(mediaUrl);
      
      if (caption) {
        media.caption = caption;
      }

      await this.client.sendMessage(to, media);

      logger.info('WhatsApp media sent successfully', {
        numberId: this.numberId,
        to,
        mediaUrl,
      });
    } catch (error: any) {
      logger.error('Failed to send WhatsApp media', {
        numberId: this.numberId,
        to,
        error: error.message,
      });
      throw error;
    }
  }

  onTyping(callback: (data: { from: string; phoneNumber: string; isTyping: boolean }) => void): void {
    // WhatsApp Web.js doesn't have direct typing indicator support
    // This is a no-op for now
    logger.debug('Typing callback registration requested (not supported by whatsapp-web.js)', {
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
   * Wait for QR code (useful for polling)
   */
  async waitForQrCode(timeout: number = 30000): Promise<string | null> {
    return new Promise((resolve) => {
      if (this.qrCode) {
        resolve(this.qrCode);
        return;
      }

      const timeoutId = setTimeout(() => {
        this.qrCodeEmitter.removeListener('qr', qrHandler);
        resolve(null);
      }, timeout);

      const qrHandler = (qr: string) => {
        clearTimeout(timeoutId);
        this.qrCodeEmitter.removeListener('qr', qrHandler);
        resolve(qr);
      };

      this.qrCodeEmitter.once('qr', qrHandler);
    });
  }
}
