// @ts-nocheck
import { downloadMediaMessage, proto } from '@whiskeysockets/baileys';
import axios from 'axios';
import { InfrastructureFactory } from '../../../../shared/infrastructure/factories/infrastructure.factory';
import { IStorage } from '../../../../shared/infrastructure/storage/storage.interface';
import { logger } from '../../../../shared/utils/logger';
import config from '../../../../config/app.config';
import { UUID } from '../../../../shared/types/common.types';
import { v4 as uuidv4 } from 'uuid';

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';

/**
 * Media Service
 * 
 * Handles media download from WhatsApp, upload to MinIO, and URL generation
 */
export class MediaService {
  private storage: IStorage;

  constructor() {
    this.storage = InfrastructureFactory.createStorage();
  }

  /**
   * Download media from WhatsApp message and upload to MinIO
   * With retry logic for large files (videos)
   */
  async downloadAndStoreWhatsAppMedia(
    socket: any,
    message: proto.IWebMessageInfo,
    whatsappNumberId: UUID,
    messageId?: UUID
  ): Promise<{ mediaUrl: string; mediaType: string; mimeType: string } | null> {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!message.message) {
          return null;
        }

        // Detect media type
        const mediaType = this.detectMediaType(message.message);
        if (!mediaType) {
          return null;
        }

        logger.info('Downloading media from WhatsApp', {
          messageId: message.key.id,
          mediaType,
          whatsappNumberId,
          attempt,
        });

        // Download media from WhatsApp with timeout
        const downloadPromise = downloadMediaMessage(
          message,
          'buffer',
          {},
          {
            logger: undefined as any,
            reuploadRequest: socket.updateMediaMessage,
          }
        );

        // Add timeout of 120 seconds for large videos
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Download timeout')), 120000)
        );

        const buffer = await Promise.race([downloadPromise, timeoutPromise]) as Buffer;

        if (!buffer || buffer.length === 0) {
          logger.warn('Downloaded buffer is empty', { messageId: message.key.id, attempt });
          
          if (attempt < maxRetries) {
            logger.info('Retrying download...', { attempt: attempt + 1, delay: retryDelay });
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
          
          return null;
        }

        // Get MIME type
        const mimeType = this.getMimeType(message.message, mediaType);

        // Generate file name
        const fileName = this.generateFileName(mediaType, mimeType);

        // Build storage path: whatsapp-media/{whatsappNumberId}/{messageId}/{type}/{filename}
        const storagePath = this.buildStoragePath(
          whatsappNumberId,
          messageId || message.key.id || uuidv4(),
          mediaType,
          fileName
        );

        // Upload to MinIO
        const bucket = config.minio.buckets.media;
        await this.storage.uploadFile(bucket, storagePath, buffer as Buffer, mimeType);

        logger.info('Media uploaded to MinIO successfully', {
          messageId: message.key.id,
          storagePath,
          mediaType,
          size: buffer.length,
          attempt,
        });

        // Return storage path (will be used to generate URL later)
        return {
          mediaUrl: storagePath,
          mediaType,
          mimeType,
        };
      } catch (error: any) {
        const isNetworkError = 
          error.code === 'ECONNRESET' || 
          error.code === 'ETIMEDOUT' ||
          error.message?.includes('timeout') ||
          error.message?.includes('terminated');

        logger.error('Error downloading and storing WhatsApp media', {
          messageId: message.key.id,
          error: error.message,
          code: error.code,
          attempt,
          isNetworkError,
        });

        // Retry on network errors
        if (isNetworkError && attempt < maxRetries) {
          logger.info('Network error detected, retrying download...', {
            attempt: attempt + 1,
            delay: retryDelay,
          });
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }

        // If all retries failed or non-network error, return null
        return null;
      }
    }

    return null;
  }

  /**
   * Download media from Meta WhatsApp Cloud API by media ID and upload to MinIO.
   * Used for incoming messages from the official API (webhook sends media ID, not URL).
   */
  async downloadAndStoreOfficialApiMedia(
    mediaId: string,
    accessToken: string,
    whatsappNumberId: UUID,
    metaMessageId: string,
    mediaType: string
  ): Promise<{ mediaUrl: string; mediaType: string; mimeType: string } | null> {
    try {
      const metaUrl = `${GRAPH_API_BASE}/${mediaId}`;
      const metaRes = await axios.get<{ url?: string }>(metaUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000,
      });
      const downloadUrl = metaRes.data?.url;
      if (!downloadUrl) {
        logger.warn('Official API media: no url in Meta response', { mediaId });
        return null;
      }
      // A URL de download (ex.: lookaside.fbsbx.com) também exige o Bearer token
      const fileRes = await axios.get(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: 20 * 1024 * 1024,
      });
      const buffer = Buffer.from(fileRes.data);
      if (!buffer.length) {
        logger.warn('Official API media: empty download', { mediaId });
        return null;
      }
      const contentType = fileRes.headers['content-type'];
      const mimeType = (typeof contentType === 'string' ? contentType.split(';')[0].trim() : '') || this.getMimeTypeFromMediaType(mediaType);
      const fileName = this.generateFileName(mediaType, mimeType);
      const storagePath = this.buildStoragePath(whatsappNumberId, metaMessageId, mediaType, fileName);
      const bucket = config.minio.buckets.media;
      await this.storage.uploadFile(bucket, storagePath, buffer, mimeType);
      logger.info('Official API media uploaded to MinIO', {
        mediaId,
        storagePath,
        mediaType,
        size: buffer.length,
      });
      return { mediaUrl: storagePath, mediaType, mimeType };
    } catch (error: any) {
      const status = error?.response?.status;
      const hint = status === 401
        ? ' Token da Meta pode estar expirado ou inválido - gere um novo em Meta for Developers ou use um System User token.'
        : '';
      logger.error('Error downloading official API media', {
        mediaId,
        error: error?.message,
        status,
        hint: status === 401 ? hint.trim() : undefined,
      });
      return null;
    }
  }

  private getMimeTypeFromMediaType(mediaType: string): string {
    const defaults: Record<string, string> = {
      image: 'image/jpeg',
      video: 'video/mp4',
      audio: 'audio/ogg',
      document: 'application/octet-stream',
    };
    return defaults[mediaType] || 'application/octet-stream';
  }

  /**
   * Upload generic file to MinIO (for quotes, etc.)
   */
  async uploadGenericFile(
    buffer: Buffer,
    mimeType: string,
    fileName: string
  ): Promise<string> {
    try {
      // Detect media type from MIME type
      let mediaType = 'document';
      if (mimeType.startsWith('image/')) {
        mediaType = 'image';
      } else if (mimeType.startsWith('video/')) {
        mediaType = 'video';
      } else if (mimeType.startsWith('audio/')) {
        mediaType = 'audio';
      }

      // Build simple storage path: uploads/mediaType/fileName
      const storagePath = `uploads/${mediaType}/${fileName}`;

      // Upload to MinIO
      const bucket = config.minio.buckets.media;
      await this.storage.uploadFile(bucket, storagePath, buffer, mimeType);

      logger.info('Generic file uploaded to MinIO', {
        storagePath,
        mediaType,
        mimeType,
        fileName,
        size: buffer.length,
      });

      return storagePath;
    } catch (error: any) {
      logger.error('Error uploading generic file', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Upload media buffer to MinIO
   */
  async uploadMediaBuffer(
    buffer: Buffer,
    mimeType: string,
    whatsappNumberId: UUID,
    messageId: UUID
  ): Promise<string> {
    try {
      // Detect media type from MIME type
      let mediaType = 'document';
      if (mimeType.startsWith('image/')) {
        mediaType = 'image';
      } else if (mimeType.startsWith('video/')) {
        mediaType = 'video';
      } else if (mimeType.startsWith('audio/')) {
        mediaType = 'audio';
      }

      // Generate file name
      const fileName = this.generateFileName(mediaType, mimeType);

      // Build storage path
      const storagePath = this.buildStoragePath(
        whatsappNumberId,
        messageId,
        mediaType,
        fileName
      );

      // Upload to MinIO
      const bucket = config.minio.buckets.media;
      await this.storage.uploadFile(bucket, storagePath, buffer, mimeType);

      logger.info('Media buffer uploaded to MinIO', {
        storagePath,
        mediaType,
        mimeType,
        size: buffer.length,
      });

      return storagePath;
    } catch (error: any) {
      logger.error('Error uploading media buffer', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get media file from MinIO
   */
  async getMediaFile(storagePath: string): Promise<Buffer> {
    try {
      const bucket = config.minio.buckets.media;
      
      logger.info('Downloading media file from MinIO', {
        bucket,
        storagePath,
      });

      // Check if file exists first
      const exists = await this.storage.fileExists(bucket, storagePath);
      if (!exists) {
        logger.error('Media file does not exist in MinIO', {
          bucket,
          storagePath,
        });
        throw new Error(`Media file not found: ${storagePath}`);
      }

      const buffer = await this.storage.downloadFile(bucket, storagePath);

      logger.info('Media file retrieved from MinIO successfully', {
        storagePath,
        bufferSize: buffer.length,
      });

      return buffer;
    } catch (error: any) {
      logger.error('Error getting media file from MinIO', {
        storagePath,
        bucket: config.minio.buckets.media,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get pre-signed URL for media access
   */
  async getMediaUrl(storagePath: string, expiresIn: number = 3600): Promise<string> {
    try {
      const bucket = config.minio.buckets.media;
      const url = await this.storage.getFileUrl(bucket, storagePath, expiresIn);

      logger.debug('Generated pre-signed URL for media', { storagePath, expiresIn });

      return url;
    } catch (error: any) {
      logger.error('Error generating media URL', {
        storagePath,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Check if media file exists
   */
  async mediaExists(storagePath: string): Promise<boolean> {
    try {
      const bucket = config.minio.buckets.media;
      return await this.storage.fileExists(bucket, storagePath);
    } catch (error: any) {
      logger.error('Error checking media existence', {
        storagePath,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Delete media file from MinIO
   */
  async deleteMedia(storagePath: string): Promise<void> {
    try {
      const bucket = config.minio.buckets.media;
      await this.storage.deleteFile(bucket, storagePath);

      logger.info('Media file deleted from MinIO', { storagePath });
    } catch (error: any) {
      logger.error('Error deleting media file', {
        storagePath,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Validate media file size and type
   */
  validateMedia(
    buffer: Buffer,
    mimeType: string
  ): { valid: boolean; error?: string } {
    // Validate MIME type
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/mpeg',
      'video/webm',
      'audio/ogg',
      'audio/mpeg',
      'audio/mp4',
      'audio/wav',
      'audio/webm', // Added for browser MediaRecorder
    ];

    if (!allowedMimeTypes.includes(mimeType)) {
      return { valid: false, error: `Tipo de mídia não suportado: ${mimeType}` };
    }

    // Validate size
    const maxSizes: Record<string, number> = {
      image: 5 * 1024 * 1024, // 5MB
      video: 16 * 1024 * 1024, // 16MB
      audio: 10 * 1024 * 1024, // 10MB
    };

    let maxSize = 5 * 1024 * 1024; // Default 5MB
    if (mimeType.startsWith('image/')) {
      maxSize = maxSizes.image;
    } else if (mimeType.startsWith('video/')) {
      maxSize = maxSizes.video;
    } else if (mimeType.startsWith('audio/')) {
      maxSize = maxSizes.audio;
    }

    if (buffer.length > maxSize) {
      return {
        valid: false,
        error: `Arquivo muito grande: ${(buffer.length / 1024 / 1024).toFixed(2)}MB (máximo: ${(maxSize / 1024 / 1024).toFixed(0)}MB)`,
      };
    }

    return { valid: true };
  }

  /**
   * Detect media type from WhatsApp message
   */
  private detectMediaType(message: proto.IMessage): string | null {
    if (message.imageMessage) return 'image';
    if (message.videoMessage) return 'video';
    if (message.audioMessage) return 'audio';
    if (message.documentMessage) return 'document';
    return null;
  }

  /**
   * Get MIME type from WhatsApp message
   */
  private getMimeType(message: proto.IMessage, mediaType: string): string {
    if (message.imageMessage?.mimetype) return message.imageMessage.mimetype;
    if (message.videoMessage?.mimetype) return message.videoMessage.mimetype;
    if (message.audioMessage?.mimetype) return message.audioMessage.mimetype;
    if (message.documentMessage?.mimetype) return message.documentMessage.mimetype;

    // Default MIME types
    const defaults: Record<string, string> = {
      image: 'image/jpeg',
      video: 'video/mp4',
      audio: 'audio/ogg',
      document: 'application/octet-stream',
    };

    return defaults[mediaType] || 'application/octet-stream';
  }

  /**
   * Generate file name with extension
   */
  private generateFileName(mediaType: string, mimeType: string): string {
    const timestamp = Date.now();
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/mpeg': 'mpeg',
      'video/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'audio/wav': 'wav',
      'audio/webm': 'webm', // Added for browser MediaRecorder
    };

    const extension = extensions[mimeType] || 'bin';
    return `${timestamp}-${uuidv4()}.${extension}`;
  }

  /**
   * Build storage path for media file
   */
  private buildStoragePath(
    whatsappNumberId: UUID,
    messageId: string,
    mediaType: string,
    fileName: string
  ): string {
    return `${whatsappNumberId}/${messageId}/${mediaType}/${fileName}`;
  }
}

// Singleton instance
export const mediaService = new MediaService();
