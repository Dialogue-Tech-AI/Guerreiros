import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { AIConfig } from '../../../ai/domain/entities/ai-config.entity';
import { logger } from '../../../../shared/utils/logger';
import { InfrastructureFactory } from '../../../../shared/infrastructure/factories/infrastructure.factory';
import { UUID } from '../../../../shared/types/common.types';
import { socketService } from '../../../../shared/infrastructure/socket/socket.service';

/**
 * Buffer Configuration Interface
 */
interface BufferConfig {
  enabled: boolean;
  bufferTimeMs: number; // Time to wait before processing (in milliseconds)
}

/**
 * Buffered Message Interface
 */
interface BufferedMessage {
  messageId: UUID;
  attendanceId: UUID;
  clientPhone: string;
  whatsappNumberId: UUID;
  content: string;
  mediaType: string;
  mediaUrl?: string;
  metadata?: any;
  timestamp: Date;
  transcription?: string; // For audio
  description?: string; // For images
  isProcessing?: boolean; // True if audio/image is still being processed
  /** Resumo do último atendimento do cliente (quando atendimento atual é novo e cliente tinha atendimentos finalizados) */
  lastAttendanceSummary?: string;
  /** Estado operacional do atendimento (TRIAGEM, ABERTO, AGUARDANDO_CLIENTE, etc.) */
  operationalState?: string;
  /** Contexto do atendimento: novo | reaberto | em_andamento */
  attendanceContext?: string;
}

/**
 * Attendance Buffer Interface
 */
interface AttendanceBuffer {
  messages: BufferedMessage[];
  timer: NodeJS.Timeout | null;
  lastActivity: Date;
}

/**
 * Message Buffer Service
 * 
 * Implements intelligent message buffering to consolidate multiple messages
 * into a single payload for more natural AI conversations.
 * 
 * Features:
 * - Configurable buffer time (3-15 seconds, default 5s)
 * - Auto-reset timer on new messages or typing events
 * - Message aggregation with proper ordering
 * - Support for text, audio transcriptions, and image descriptions
 */
export class MessageBufferService {
  private buffers: Map<UUID, AttendanceBuffer> = new Map();
  private defaultConfig: BufferConfig = {
    enabled: false, // Disabled by default for backward compatibility
    bufferTimeMs: 5000, // 5 seconds default
  };

  /**
   * Get buffer configuration from database
   */
  private async getBufferConfig(): Promise<BufferConfig> {
    try {
      const configRepo = AppDataSource.getRepository(AIConfig);
      const config = await configRepo.findOne({
        where: { key: 'message_buffer_config' },
      });

      if (config && config.value) {
        const parsedConfig = JSON.parse(config.value);
        
        // Validate buffer time is within allowed range (3-15 seconds)
        const bufferTimeMs = Math.max(3000, Math.min(15000, parsedConfig.bufferTimeMs || 5000));
        
        return {
          enabled: parsedConfig.enabled || false,
          bufferTimeMs,
        };
      }
    } catch (error: any) {
      logger.warn('Failed to load buffer config, using defaults', {
        error: error.message,
      });
    }

    return this.defaultConfig;
  }

  /**
   * Add a message to the buffer
   */
  async addMessage(message: BufferedMessage): Promise<void> {
    const config = await this.getBufferConfig();

    // If buffer is disabled, process immediately
    if (!config.enabled) {
      await this.processMessagesImmediately([message]);
      return;
    }

    const { attendanceId } = message;

    // Get or create buffer for this attendance
    let buffer = this.buffers.get(attendanceId);
    
    if (!buffer) {
      buffer = {
        messages: [],
        timer: null,
        lastActivity: new Date(),
      };
      this.buffers.set(attendanceId, buffer);
    }

    // Cancel existing timer (will be reset)
    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = null;
    }

    // Add message to buffer
    buffer.messages.push(message);
    buffer.lastActivity = new Date();

    logger.debug('Message added to buffer', {
      attendanceId,
      messageCount: buffer.messages.length,
      bufferTimeMs: config.bufferTimeMs,
    });

    // Set new timer
    buffer.timer = setTimeout(async () => {
      await this.flushBuffer(attendanceId);
    }, config.bufferTimeMs);

    logger.info('Buffer timer set', {
      attendanceId,
      bufferTimeMs: config.bufferTimeMs,
      totalMessages: buffer.messages.length,
    });
  }

  /**
   * Handle typing event - resets the buffer timer
   */
  async onTypingEvent(attendanceId: UUID): Promise<void> {
    const config = await this.getBufferConfig();

    if (!config.enabled) {
      return;
    }

    const buffer = this.buffers.get(attendanceId);
    
    if (!buffer || buffer.messages.length === 0) {
      return;
    }

    // Cancel existing timer
    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = null;
    }

    // Update last activity
    buffer.lastActivity = new Date();

    logger.debug('Typing event - timer reset', {
      attendanceId,
      messageCount: buffer.messages.length,
    });

    // Set new timer
    buffer.timer = setTimeout(async () => {
      await this.flushBuffer(attendanceId);
    }, config.bufferTimeMs);
  }

  /**
   * Flush buffer for a specific attendance
   */
  private async flushBuffer(attendanceId: UUID): Promise<void> {
    const buffer = this.buffers.get(attendanceId);

    if (!buffer || buffer.messages.length === 0) {
      logger.debug('No messages to flush', { attendanceId });
      return;
    }

    // Check if any messages are still being processed (audio/image)
    const hasProcessingMessages = buffer.messages.some(m => m.isProcessing);
    
    if (hasProcessingMessages) {
      const processingCount = buffer.messages.filter(m => m.isProcessing).length;
      logger.info('⏳ Buffer has messages still processing - waiting...', {
        attendanceId,
        totalMessages: buffer.messages.length,
        processingCount,
      });

      // Reschedule flush in 2 seconds to check again
      if (buffer.timer) {
        clearTimeout(buffer.timer);
      }
      buffer.timer = setTimeout(async () => {
        await this.flushBuffer(attendanceId);
      }, 2000);

      return;
    }

    logger.info('Flushing buffer', {
      attendanceId,
      messageCount: buffer.messages.length,
    });

    // Sort messages by timestamp
    const sortedMessages = buffer.messages.sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    // Build consolidated content
    const consolidatedContent = this.buildConsolidatedContent(sortedMessages);

    // Get the most recent message for metadata
    const latestMessage = sortedMessages[sortedMessages.length - 1];

    // Se a última mensagem é áudio/imagem com mediaUrl mas sem transcrição/descrição, enviar mediaUrl e mediaType para o worker transcrever/descrever
    const needsMediaProcessing =
      latestMessage.mediaUrl &&
      (latestMessage.mediaType === 'audio' || latestMessage.mediaType === 'image') &&
      !latestMessage.transcription &&
      !latestMessage.description;

    // Process the consolidated message (preserve lastAttendanceSummary, operationalState, attendanceContext from first message that has them)
    const firstWithContext = sortedMessages.find(m => m.lastAttendanceSummary != null || m.operationalState != null || m.attendanceContext != null);
    const lastAttendanceSummary = firstWithContext?.lastAttendanceSummary ?? sortedMessages.find(m => m.lastAttendanceSummary != null)?.lastAttendanceSummary;
    const operationalState = firstWithContext?.operationalState ?? sortedMessages.find(m => m.operationalState != null)?.operationalState;
    const attendanceContext = firstWithContext?.attendanceContext ?? sortedMessages.find(m => m.attendanceContext != null)?.attendanceContext;
    await this.processConsolidatedMessage({
      messageId: latestMessage.messageId,
      attendanceId,
      clientPhone: latestMessage.clientPhone,
      whatsappNumberId: latestMessage.whatsappNumberId,
      content: consolidatedContent,
      mediaType: needsMediaProcessing ? latestMessage.mediaType! : 'text',
      mediaUrl: needsMediaProcessing ? latestMessage.mediaUrl : undefined,
      metadata: {
        ...latestMessage.metadata,
        consolidatedMessages: sortedMessages.map(m => m.messageId),
        messageCount: sortedMessages.length,
      },
      timestamp: latestMessage.timestamp,
      ...(lastAttendanceSummary != null && { lastAttendanceSummary }),
      ...(operationalState != null && { operationalState }),
      ...(attendanceContext != null && { attendanceContext }),
    });

    // Clear buffer
    if (buffer.timer) {
      clearTimeout(buffer.timer);
    }
    this.buffers.delete(attendanceId);

    logger.info('Buffer flushed successfully', {
      attendanceId,
      messageCount: sortedMessages.length,
    });
  }

  /**
   * Build consolidated content from buffered messages
   */
  private buildConsolidatedContent(messages: BufferedMessage[]): string {
    const contentParts: string[] = [];

    logger.info('🔨 Building consolidated content', {
      messageCount: messages.length,
      types: messages.map(m => m.mediaType),
    });

    for (const message of messages) {
      let messagePart = '';

      logger.debug(`Processing message ${message.messageId}`, {
        mediaType: message.mediaType,
        hasTranscription: !!message.transcription,
        hasDescription: !!message.description,
        contentPreview: message.content?.substring(0, 50),
      });

      // Handle different media types
      if (message.mediaType === 'audio' && message.transcription) {
        messagePart = `<audio>\n${message.transcription}\n</audio>`;
        logger.info(`✅ Adding audio with transcription`, {
          length: message.transcription.length,
          preview: message.transcription.substring(0, 100),
        });
      } else if (message.mediaType === 'image' && message.description) {
        messagePart = `<imagem>\n${message.description}\n</imagem>`;
        logger.info(`✅ Adding image with description`, {
          length: message.description.length,
          preview: message.description.substring(0, 100),
        });
      } else if (message.mediaType === 'audio' && !message.transcription) {
        logger.warn(`⚠️  Audio message WITHOUT transcription!`, {
          messageId: message.messageId,
          content: message.content,
        });
        messagePart = `<audio>\n${message.content || '[Áudio sem transcrição]'}\n</audio>`;
      } else if (message.mediaType === 'image' && !message.description) {
        logger.warn(`⚠️  Image message WITHOUT description!`, {
          messageId: message.messageId,
          content: message.content,
        });
        messagePart = `<imagem>\n${message.content || '[Imagem sem descrição]'}\n</imagem>`;
      } else if (message.mediaType === 'video') {
        messagePart = `<video>\nO cliente enviou um vídeo.\n</video>`;
        logger.debug(`Adding video reference`);
      } else if (message.mediaType === 'document') {
        messagePart = `<documento>\nO cliente enviou um documento.\n</documento>`;
        logger.debug(`Adding document reference`);
      } else if (message.content) {
        // Text messages don't need tags in the consolidated view
        messagePart = message.content;
        logger.debug(`Adding text message`, {
          preview: message.content.substring(0, 50),
        });
      }

      if (messagePart) {
        contentParts.push(messagePart);
      } else {
        logger.warn(`⚠️  No content generated for message`, {
          messageId: message.messageId,
          mediaType: message.mediaType,
        });
      }
    }

    const consolidatedContent = contentParts.join('\n');
    logger.info('✅ Consolidated content built', {
      totalLength: consolidatedContent.length,
      preview: consolidatedContent.substring(0, 200),
    });

    return consolidatedContent;
  }

  /**
   * Process consolidated message (send to AI queue)
   */
  private async processConsolidatedMessage(message: BufferedMessage): Promise<void> {
    try {
      const queueService = InfrastructureFactory.createQueue();
      const aiQueueName = 'ai-messages';

      await queueService.publish(aiQueueName, {
        messageId: message.messageId,
        attendanceId: message.attendanceId,
        clientPhone: message.clientPhone,
        whatsappNumberId: message.whatsappNumberId,
        content: message.content,
        mediaType: message.mediaType,
        mediaUrl: message.mediaUrl,
        metadata: {
          ...message.metadata,
          isConsolidated: true,
        },
        timestamp: message.timestamp.toISOString(),
        ...(message.lastAttendanceSummary != null && { lastAttendanceSummary: message.lastAttendanceSummary }),
        ...(message.operationalState != null && { operationalState: message.operationalState }),
        ...(message.attendanceContext != null && { attendanceContext: message.attendanceContext }),
      });

      logger.info('Consolidated message published to AI queue', {
        messageId: message.messageId,
        attendanceId: message.attendanceId,
        messageCount: message.metadata?.messageCount || 1,
      });
    } catch (error: any) {
      logger.error('Error publishing consolidated message to AI queue', {
        error: error.message,
        messageId: message.messageId,
        attendanceId: message.attendanceId,
      });
      throw error;
    }
  }

  /**
   * Process messages immediately (when buffer is disabled)
   */
  private async processMessagesImmediately(messages: BufferedMessage[]): Promise<void> {
    for (const message of messages) {
      try {
        const queueService = InfrastructureFactory.createQueue();
        const aiQueueName = 'ai-messages';

        let content = message.content;
        
        // Add semantic tags for transcriptions/descriptions
        if (message.mediaType === 'audio' && message.transcription) {
          content = message.transcription;
        } else if (message.mediaType === 'image' && message.description) {
          content = message.description;
        } else if (message.mediaType === 'video') {
          content = `<video>\nO cliente enviou um vídeo.\n</video>`;
        } else if (message.mediaType === 'document') {
          content = `<documento>\nO cliente enviou um documento.\n</documento>`;
        }

        await queueService.publish(aiQueueName, {
          messageId: message.messageId,
          attendanceId: message.attendanceId,
          clientPhone: message.clientPhone,
          whatsappNumberId: message.whatsappNumberId,
          content: content || '[Mensagem de mídia]',
          mediaType: message.mediaType,
          mediaUrl: message.mediaUrl,
          metadata: message.metadata,
          timestamp: message.timestamp.toISOString(),
          ...(message.lastAttendanceSummary != null && { lastAttendanceSummary: message.lastAttendanceSummary }),
          ...(message.operationalState != null && { operationalState: message.operationalState }),
          ...(message.attendanceContext != null && { attendanceContext: message.attendanceContext }),
        });

        logger.info('Message published to AI queue (immediate mode)', {
          messageId: message.messageId,
          attendanceId: message.attendanceId,
        });
      } catch (error: any) {
        logger.error('Error publishing message to AI queue', {
          error: error.message,
          messageId: message.messageId,
          attendanceId: message.attendanceId,
        });
      }
    }
  }

  /**
   * Update media transcription/description for a buffered message
   * This is called when audio/image processing completes
   */
  async updateMessageMedia(
    attendanceId: UUID,
    messageId: UUID,
    transcription?: string,
    description?: string
  ): Promise<void> {
    const buffer = this.buffers.get(attendanceId);

    if (!buffer) {
      logger.warn('Buffer not found for attendance', { attendanceId, messageId });
      return;
    }

    // Find message in buffer
    const message = buffer.messages.find(m => m.messageId === messageId);

    if (!message) {
      logger.warn('Message not found in buffer', { attendanceId, messageId });
      return;
    }

    // Update transcription/description
    if (transcription) {
      message.transcription = transcription;
      message.content = transcription; // Update content with transcription
      logger.info(`📝 Updated message with transcription`, {
        messageId,
        length: transcription.length,
        preview: transcription.substring(0, 100),
      });
    }
    if (description) {
      message.description = description;
      message.content = description; // Update content with description
      logger.info(`📝 Updated message with description`, {
        messageId,
        length: description.length,
        preview: description.substring(0, 100),
      });
    }

    // Mark as no longer processing
    message.isProcessing = false;

    logger.info('✅ Media processing completed for buffered message', {
      attendanceId,
      messageId,
      hasTranscription: !!transcription,
      hasDescription: !!description,
      messageTranscription: message.transcription?.substring(0, 50),
      messageDescription: message.description?.substring(0, 50),
    });

    // Check if all messages are ready now - if so, flush immediately
    const hasProcessingMessages = buffer.messages.some(m => m.isProcessing);
    if (!hasProcessingMessages) {
      logger.info('🚀 All messages ready - flushing buffer immediately', {
        attendanceId,
        messageCount: buffer.messages.length,
      });

      // Cancel existing timer and flush now
      if (buffer.timer) {
        clearTimeout(buffer.timer);
        buffer.timer = null;
      }

      await this.flushBuffer(attendanceId);
    }
  }

  /**
   * Force flush buffer for a specific attendance (useful for manual triggers)
   */
  async forceFlush(attendanceId: UUID): Promise<void> {
    await this.flushBuffer(attendanceId);
  }

  /**
   * Clear buffer for a specific attendance (e.g. when seller sends quote - human took over).
   * Evita que flush posterior envie mensagens antigas do buffer e cause exibição incorreta.
   */
  clearBufferForAttendance(attendanceId: UUID): void {
    const buffer = this.buffers.get(attendanceId);
    if (buffer) {
      if (buffer.timer) {
        clearTimeout(buffer.timer);
        buffer.timer = null;
      }
      this.buffers.delete(attendanceId);
      logger.info('Buffer cleared for attendance (e.g. quote sent)', {
        attendanceId,
        hadMessages: buffer.messages.length,
      });
    }
  }

  /**
   * Clear all buffers (useful for cleanup/shutdown)
   */
  async clearAllBuffers(): Promise<void> {
    for (const [attendanceId, buffer] of this.buffers.entries()) {
      if (buffer.timer) {
        clearTimeout(buffer.timer);
      }
    }
    this.buffers.clear();
    logger.info('All buffers cleared');
  }

  /**
   * Get buffer statistics (useful for monitoring)
   */
  getBufferStats(): { attendanceId: UUID; messageCount: number; lastActivity: Date }[] {
    const stats: { attendanceId: UUID; messageCount: number; lastActivity: Date }[] = [];
    
    for (const [attendanceId, buffer] of this.buffers.entries()) {
      stats.push({
        attendanceId,
        messageCount: buffer.messages.length,
        lastActivity: buffer.lastActivity,
      });
    }
    
    return stats;
  }
}

// Singleton instance
export const messageBufferService = new MessageBufferService();
