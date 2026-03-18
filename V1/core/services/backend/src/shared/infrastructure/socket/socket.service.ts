import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../../utils/logger';

/**
 * Socket.IO Service
 * 
 * Singleton service to access Socket.IO server instance
 */
class SocketService {
  private ioInstance: SocketIOServer | null = null;

  setIO(io: SocketIOServer): void {
    this.ioInstance = io;
  }

  getIO(): SocketIOServer {
    if (!this.ioInstance) {
      throw new Error('Socket.IO server not initialized. Call setIO() first.');
    }
    return this.ioInstance;
  }

  /**
   * Emit event to all connected clients
   */
  emit(event: string, data: any): void {
    if (this.ioInstance) {
      this.ioInstance.emit(event, data);
    }
  }

  /**
   * Emit event to a specific room
   */
  emitToRoom(room: string, event: string, data: any): void {
    if (this.ioInstance) {
      try {
        const adapter = this.ioInstance.of('/').adapter;
        const roomSockets = adapter.rooms.get(room);
        const clientsInRoom = roomSockets ? roomSockets.size : 0;
        // Em produção evita encher log a cada mensagem; só debug ou quando não há clientes na room
        if (process.env.NODE_ENV !== 'production') {
          logger.info(`📤 Socket.IO emitToRoom`, { room, event, clientsInRoom, hasData: !!data });
        } else if (clientsInRoom === 0) {
          logger.debug(`Socket.IO emitToRoom (no clients)`, { room, event });
        }
        this.ioInstance.to(room).emit(event, data);
      } catch (err: any) {
        logger.error('Error in emitToRoom', { room, event, error: err?.message });
        this.ioInstance!.to(room).emit(event, data);
      }
    } else {
      logger.warn('⚠️ Socket.IO instance not available for emitToRoom', { room, event });
    }
  }

  /**
   * Emit message sent event to appropriate rooms
   * CORREÇÃO: Remover broadcasts globais para evitar mistura de mensagens entre chats simultâneos
   */
  emitMessageSent(attendanceId: string, message: any): void {
    if (!this.ioInstance) return;

    const eventData = {
      attendanceId,
      messageId: message.id,
      clientPhone: message.attendance?.clientPhone || '',
      isUnassigned: !message.attendance?.sellerId,
      message: {
        id: message.id,
        content: message.content,
        origin: message.origin,
        status: message.status,
        sentAt: message.sentAt?.toISOString() || new Date().toISOString(),
        metadata: message.metadata,
      },
    };

    // Emit to specific rooms ONLY - no global broadcast
    if (message.attendance?.sellerId) {
      this.emitToRoom(`seller_${message.attendance.sellerId}`, 'message_sent', eventData);
      this.emitToRoom(`seller_${message.attendance.sellerId}`, 'message_received', eventData);
      // Also emit to supervisors so they can monitor
      this.emitToRoom('supervisors', 'message_sent', eventData);
      this.emitToRoom('supervisors', 'message_received', eventData);
    } else {
      // Unassigned messages only go to supervisors
      this.emitToRoom('supervisors', 'message_sent', eventData);
      this.emitToRoom('supervisors', 'message_received', eventData);
    }
  }
}

// Singleton instance
export const socketService = new SocketService();