import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { Notification, NotificationType, NotificationPriority } from '../../domain/entities/notification.entity';
import { UUID } from '../../../../shared/types/common.types';
import { logger } from '../../../../shared/utils/logger';
import { socketService } from '../../../../shared/infrastructure/socket/socket.service';
import { MoreThan } from 'typeorm';

interface CreateNotificationData {
  userId: UUID;
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  attendanceId?: UUID;
  referenceId?: string;
  actionUrl?: string;
  expiresAt?: Date;
}

export class NotificationService {
  /**
   * Create a new notification and emit via Socket.IO
   */
  async createNotification(data: CreateNotificationData): Promise<Notification> {
    try {
      const notificationRepo = AppDataSource.getRepository(Notification);

      // Check for duplicate notification (same reference_id within last 5 seconds)
      if (data.referenceId) {
        const fiveSecondsAgo = new Date(Date.now() - 5000);
        const existingNotification = await notificationRepo.findOne({
          where: {
            userId: data.userId,
            referenceId: data.referenceId,
            createdAt: MoreThan(fiveSecondsAgo),
          },
        });

        if (existingNotification) {
          logger.debug('Duplicate notification prevented', {
            userId: data.userId,
            referenceId: data.referenceId,
          });
          return existingNotification;
        }
      }

      // Create notification
      const notification = notificationRepo.create({
        userId: data.userId,
        type: data.type,
        priority: data.priority || NotificationPriority.MEDIUM,
        title: data.title,
        message: data.message,
        metadata: data.metadata,
        attendanceId: data.attendanceId,
        referenceId: data.referenceId,
        actionUrl: data.actionUrl,
        expiresAt: data.expiresAt,
        isRead: false,
      });

      await notificationRepo.save(notification);

      logger.info('Notification created', {
        notificationId: notification.id,
        userId: data.userId,
        type: data.type,
      });

      // Emit via Socket.IO to user's room
      socketService.emitToRoom(`user_${data.userId}`, 'notification:new', {
        id: notification.id,
        type: notification.type,
        priority: notification.priority,
        title: notification.title,
        message: notification.message,
        metadata: notification.metadata,
        attendanceId: notification.attendanceId,
        actionUrl: notification.actionUrl,
        isRead: notification.isRead,
        createdAt: notification.createdAt.toISOString(),
      });

      // Also emit unread count
      const unreadCount = await this.getUnreadCount(data.userId);
      socketService.emitToRoom(`user_${data.userId}`, 'notification:unread_count', {
        count: unreadCount,
      });

      return notification;
    } catch (error: any) {
      logger.error('Error creating notification', {
        error: error.message,
        stack: error.stack,
        data,
      });
      throw error;
    }
  }

  /**
   * Create notifications for multiple users
   */
  async createNotificationForUsers(userIds: UUID[], data: Omit<CreateNotificationData, 'userId'>): Promise<Notification[]> {
    const notifications: Notification[] = [];

    for (const userId of userIds) {
      try {
        const notification = await this.createNotification({
          ...data,
          userId,
        });
        notifications.push(notification);
      } catch (error: any) {
        logger.error('Error creating notification for user', {
          userId,
          error: error.message,
        });
      }
    }

    return notifications;
  }

  /**
   * Get all notifications for a user
   */
  async getNotifications(userId: UUID, limit: number = 50, offset: number = 0): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
    try {
      const notificationRepo = AppDataSource.getRepository(Notification);

      const [notifications, total] = await notificationRepo.findAndCount({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: limit,
        skip: offset,
      });

      const unreadCount = await notificationRepo.count({
        where: { userId, isRead: false },
      });

      return {
        notifications,
        total,
        unreadCount,
      };
    } catch (error: any) {
      logger.error('Error getting notifications', {
        error: error.message,
        userId,
      });
      throw error;
    }
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: UUID): Promise<number> {
    try {
      const notificationRepo = AppDataSource.getRepository(Notification);

      return await notificationRepo.count({
        where: { userId, isRead: false },
      });
    } catch (error: any) {
      logger.error('Error getting unread count', {
        error: error.message,
        userId,
      });
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: UUID, userId: UUID): Promise<void> {
    try {
      const notificationRepo = AppDataSource.getRepository(Notification);

      const notification = await notificationRepo.findOne({
        where: { id: notificationId, userId },
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      if (!notification.isRead) {
        notification.isRead = true;
        notification.readAt = new Date();
        await notificationRepo.save(notification);

        logger.info('Notification marked as read', {
          notificationId,
          userId,
        });

        // Emit updated unread count
        const unreadCount = await this.getUnreadCount(userId);
        socketService.emitToRoom(`user_${userId}`, 'notification:unread_count', {
          count: unreadCount,
        });
      }
    } catch (error: any) {
      logger.error('Error marking notification as read', {
        error: error.message,
        notificationId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: UUID): Promise<void> {
    try {
      const notificationRepo = AppDataSource.getRepository(Notification);

      await notificationRepo.update(
        { userId, isRead: false },
        { isRead: true, readAt: new Date() }
      );

      logger.info('All notifications marked as read', { userId });

      // Emit updated unread count (should be 0)
      socketService.emitToRoom(`user_${userId}`, 'notification:unread_count', {
        count: 0,
      });
    } catch (error: any) {
      logger.error('Error marking all notifications as read', {
        error: error.message,
        userId,
      });
      throw error;
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: UUID, userId: UUID): Promise<void> {
    try {
      const notificationRepo = AppDataSource.getRepository(Notification);

      const result = await notificationRepo.delete({
        id: notificationId,
        userId,
      });

      if (result.affected === 0) {
        throw new Error('Notification not found');
      }

      logger.info('Notification deleted', {
        notificationId,
        userId,
      });

      // Emit updated unread count
      const unreadCount = await this.getUnreadCount(userId);
      socketService.emitToRoom(`user_${userId}`, 'notification:unread_count', {
        count: unreadCount,
      });
    } catch (error: any) {
      logger.error('Error deleting notification', {
        error: error.message,
        notificationId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Delete all read notifications for a user
   */
  async deleteAllRead(userId: UUID): Promise<number> {
    try {
      const notificationRepo = AppDataSource.getRepository(Notification);

      const result = await notificationRepo.delete({
        userId,
        isRead: true,
      });

      logger.info('All read notifications deleted', {
        userId,
        count: result.affected || 0,
      });

      return result.affected || 0;
    } catch (error: any) {
      logger.error('Error deleting read notifications', {
        error: error.message,
        userId,
      });
      throw error;
    }
  }

  /**
   * Mark all ATTENDANCE_RELOCATED_INTERVENTION notifications for an attendance as read.
   * Usado quando o supervisor abre a conversa realocada.
   */
  async markRelocationAsReadByAttendance(userId: UUID, attendanceId: UUID): Promise<number> {
    try {
      const notificationRepo = AppDataSource.getRepository(Notification);
      const list = await notificationRepo.find({
        where: {
          userId,
          attendanceId,
          type: NotificationType.ATTENDANCE_RELOCATED_INTERVENTION,
          isRead: false,
        },
      });
      for (const n of list) {
        await this.markAsRead(n.id, userId);
      }
      return list.length;
    } catch (error: any) {
      logger.error('markRelocationAsReadByAttendance', { error: error.message, userId, attendanceId });
      return 0;
    }
  }

  /**
   * Clean up expired notifications
   */
  async cleanupExpired(): Promise<number> {
    try {
      const notificationRepo = AppDataSource.getRepository(Notification);

      const result = await notificationRepo
        .createQueryBuilder()
        .delete()
        .where('expires_at IS NOT NULL AND expires_at < NOW()')
        .execute();

      logger.info('Expired notifications cleaned up', {
        count: result.affected || 0,
      });

      return result.affected || 0;
    } catch (error: any) {
      logger.error('Error cleaning up expired notifications', {
        error: error.message,
      });
      throw error;
    }
  }
}

// Singleton instance
export const notificationService = new NotificationService();
