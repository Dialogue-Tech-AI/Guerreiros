// @ts-nocheck
import {
  IWhatsAppAdapter,
  WhatsAppMessage,
} from '../../../domain/interfaces/whatsapp-adapter.interface';
import { logger } from '../../../../../shared/utils/logger';
import { convertWebmToOgg } from '../../../../../shared/utils/audio-converter';
import axios, { AxiosError } from 'axios';
import FormData from 'form-data';
import sharp from 'sharp';

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';

export interface MetaCloudAdapterConfig {
  numberId: string;
  name: string;
  config?: {
    phoneNumberId: string;
    accessToken: string;
    verifyToken?: string;
  };
}

/**
 * Meta WhatsApp Cloud API adapter.
 * Receives messages via webhook (handled by controller); sends via Graph API.
 */
export class MetaCloudAdapter implements IWhatsAppAdapter {
  private readonly numberId: string;
  private readonly name: string;
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  private connected = false;
  private messageCallbacks: Array<(message: WhatsAppMessage) => void> = [];
  private typingCallbacks: Array<(data: { from: string; phoneNumber: string; isTyping: boolean }) => void> = [];

  constructor(config: MetaCloudAdapterConfig) {
    this.numberId = config.numberId;
    this.name = config.name;
    const conf = config.config ?? {};
    this.phoneNumberId = conf.phoneNumberId ?? '';
    this.accessToken = conf.accessToken ?? '';
    if (this.phoneNumberId && this.accessToken) {
      this.connected = true;
    }
    logger.info('MetaCloudAdapter initialized', {
      numberId: this.numberId,
      hasPhoneNumberId: !!this.phoneNumberId,
    });
  }

  private formatTo(to: string): string {
    return to.replace(/\D/g, '').replace(/^\+/, '').trim();
  }

  async connect(): Promise<{ status: string }> {
    if (this.phoneNumberId && this.accessToken) {
      this.connected = true;
      return { status: 'connected' };
    }
    logger.warn('MetaCloudAdapter connect: missing phoneNumberId or accessToken', {
      numberId: this.numberId,
    });
    return { status: 'disconnected' };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    logger.info('MetaCloudAdapter disconnected', { numberId: this.numberId });
  }

  isConnected(): boolean {
    return this.connected && !!this.phoneNumberId && !!this.accessToken;
  }

  getType(): 'OFFICIAL' | 'UNOFFICIAL' {
    return 'OFFICIAL';
  }

  onMessage(callback: (message: WhatsAppMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  onTyping(callback: (data: { from: string; phoneNumber: string; isTyping: boolean }) => void): void {
    this.typingCallbacks.push(callback);
  }

  async sendMessage(to: string, message: string, senderName?: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('WhatsApp Official adapter is not connected');
    }
    const toFormatted = this.formatTo(to);
    const body = senderName ? `*${senderName}:*\n${message}` : message;
    const url = `${GRAPH_API_BASE}/${this.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: toFormatted,
      type: 'text',
      text: { body },
    };
    try {
      const res = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
      if (res.data?.error) {
        throw new Error(res.data.error.message || JSON.stringify(res.data.error));
      }
      logger.info('Meta Cloud API text message sent', {
        numberId: this.numberId,
        to: toFormatted,
      });
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: { message?: string; code?: number } }>;
      const message = axiosError.response?.data?.error?.message ?? axiosError.message;
      logger.error('Meta Cloud API send message failed', {
        numberId: this.numberId,
        to: toFormatted,
        error: message,
        status: axiosError.response?.status,
      });
      throw new Error(`WhatsApp Official send failed: ${message}`);
    }
  }

  async sendMedia(to: string, mediaUrl: string, caption?: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('WhatsApp Official adapter is not connected');
    }
    const toFormatted = this.formatTo(to);
    let buffer: Buffer;
    let mimeType = 'application/octet-stream';
    try {
      const res = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: 100 * 1024 * 1024,
      });
      buffer = Buffer.from(res.data);
      const contentType = res.headers['content-type'];
      if (typeof contentType === 'string') {
        mimeType = contentType.split(';')[0].trim();
      }
    } catch (err) {
      const msg = (err as Error).message;
      logger.error('MetaCloudAdapter: failed to download media from URL', {
        numberId: this.numberId,
        mediaUrl: mediaUrl.substring(0, 80),
        error: msg,
      });
      throw new Error(`Failed to download media: ${msg}`);
    }

    // WhatsApp Cloud API para imagens aceita apenas JPEG e PNG. WebP/GIF falham ou não chegam.
    // Normalizar orientação EXIF (rotate()) para que imagens "verticais" cheguem corretas ao cliente.
    if (mimeType.startsWith('image/')) {
      try {
        const pipeline = sharp(buffer).rotate(); // aplica orientação EXIF
        const isWebpOrGif = mimeType === 'image/webp' || mimeType === 'image/gif';
        if (isWebpOrGif) {
          logger.info('MetaCloudAdapter: converting image to JPEG for Cloud API', { original: mimeType });
          buffer = await pipeline.jpeg({ quality: 90 }).toBuffer();
          mimeType = 'image/jpeg';
        } else {
          buffer = await pipeline.toBuffer();
        }
      } catch (imgErr: any) {
        logger.warn('MetaCloudAdapter: image normalize failed, sending as-is', { error: imgErr?.message, mimeType });
      }
    }

    // WhatsApp Cloud API does not support audio/webm; convert to ogg (supported)
    if (mimeType.startsWith('audio/webm')) {
      try {
        logger.info('MetaCloudAdapter: converting audio/webm to audio/ogg for Cloud API');
        buffer = await convertWebmToOgg(buffer);
        mimeType = 'audio/ogg';
      } catch (convErr: any) {
        logger.error('MetaCloudAdapter: webm to ogg conversion failed', {
          numberId: this.numberId,
          error: convErr.message,
        });
        throw new Error(
          'Áudio em formato WebM não é suportado pela API oficial. Instale ffmpeg no servidor (apt install ffmpeg) para conversão automática.'
        );
      }
    }

    let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
    if (mimeType.startsWith('image/')) mediaType = 'image';
    else if (mimeType.startsWith('video/')) mediaType = 'video';
    else if (mimeType.startsWith('audio/')) mediaType = 'audio';

    const form = new FormData();
    form.append('file', buffer, {
      filename: `file.${mimeType.split('/')[1] || 'bin'}`,
      contentType: mimeType,
    });
    form.append('type', mimeType);
    form.append('messaging_product', 'whatsapp');

    const uploadUrl = `${GRAPH_API_BASE}/${this.phoneNumberId}/media`;
    let mediaId: string;
    try {
      const uploadRes = await axios.post(uploadUrl, form, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...form.getHeaders(),
        },
        timeout: 60000,
        maxBodyLength: 100 * 1024 * 1024,
      });
      mediaId = uploadRes.data?.id;
      if (!mediaId) {
        throw new Error(uploadRes.data?.error?.message || 'No media id in response');
      }
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: { message?: string } }>;
      const message = axiosError.response?.data?.error?.message ?? (err as Error).message;
      logger.error('Meta Cloud API media upload failed', {
        numberId: this.numberId,
        error: message,
      });
      throw new Error(`WhatsApp Official media upload failed: ${message}`);
    }

    const messagePayload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: toFormatted,
      type: mediaType,
      [mediaType]: { id: mediaId },
    };
    if (caption && (mediaType === 'image' || mediaType === 'video' || mediaType === 'document')) {
      messagePayload.caption = caption;
    }

    const messagesUrl = `${GRAPH_API_BASE}/${this.phoneNumberId}/messages`;
    try {
      await axios.post(messagesUrl, messagePayload, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
      logger.info('Meta Cloud API media message sent', {
        numberId: this.numberId,
        to: toFormatted,
        mediaType,
      });
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: { message?: string } }>;
      const message = axiosError.response?.data?.error?.message ?? (err as Error).message;
      logger.error('Meta Cloud API send media message failed', {
        numberId: this.numberId,
        to: toFormatted,
        error: message,
      });
      throw new Error(`WhatsApp Official send media failed: ${message}`);
    }
  }

  async sendTyping(_to: string, _isTyping: boolean): Promise<void> {
    // Meta Cloud API typing indicator is optional; no-op to avoid breaking callers
  }
}
