import { Request, Response } from 'express';
import { notificationService } from '../../application/services/notification.service';
import { logger } from '../../../../shared/utils/logger';

export class NotificationController {
  /**
   * Get all notifications for the authenticated user
   * GET /api/notifications
   */
  async getNotifications(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.sub;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await notificationService.getNotifications(userId, limit, offset);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Error getting notifications', {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to get notifications',
        error: error.message,
      });
    }
  }

  /**
   * Get unread count for the authenticated user
   * GET /api/notifications/unread-count
   */
  async getUnreadCount(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.sub;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const count = await notificationService.getUnreadCount(userId);

      res.json({
        success: true,
        data: { count },
      });
    } catch (error: any) {
      logger.error('Error getting unread count', {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to get unread count',
        error: error.message,
      });
    }
  }

  /**
   * Mark notification as read
   * PATCH /api/notifications/:id/read
   */
  async markAsRead(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.sub;
      const notificationId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      await notificationService.markAsRead(notificationId, userId);

      res.json({
        success: true,
        message: 'Notification marked as read',
      });
    } catch (error: any) {
      logger.error('Error marking notification as read', {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read',
        error: error.message,
      });
    }
  }

  /**
   * Mark all notifications as read
   * POST /api/notifications/read-all
   */
  async markAllAsRead(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.sub;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      await notificationService.markAllAsRead(userId);

      res.json({
        success: true,
        message: 'All notifications marked as read',
      });
    } catch (error: any) {
      logger.error('Error marking all notifications as read', {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to mark all notifications as read',
        error: error.message,
      });
    }
  }

  /**
   * Delete a notification
   * DELETE /api/notifications/:id
   */
  async deleteNotification(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.sub;
      const notificationId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      await notificationService.deleteNotification(notificationId, userId);

      res.json({
        success: true,
        message: 'Notification deleted',
      });
    } catch (error: any) {
      logger.error('Error deleting notification', {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to delete notification',
        error: error.message,
      });
    }
  }

  /**
   * Mark relocation notifications for an attendance as read
   * POST /notifications/mark-read-by-attendance/:attendanceId
   */
  async markRelocationAsReadByAttendance(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.sub;
      const attendanceId = req.params.attendanceId;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const count = await notificationService.markRelocationAsReadByAttendance(userId, attendanceId);
      res.json({ success: true, data: { markedCount: count } });
    } catch (error: any) {
      logger.error('markRelocationAsReadByAttendance', { error: error.message });
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete all read notifications
   * DELETE /api/notifications/read
   */
  async deleteAllRead(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.sub;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const count = await notificationService.deleteAllRead(userId);

      res.json({
        success: true,
        message: 'Read notifications deleted',
        data: { count },
      });
    } catch (error: any) {
      logger.error('Error deleting read notifications', {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to delete read notifications',
        error: error.message,
      });
    }
  }
}

// Singleton instance
export const notificationController = new NotificationController();
