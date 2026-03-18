import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller';
import { authMiddleware } from '../../../../shared/presentation/middlewares/auth.middleware';

const router = Router();

// All notification routes require authentication
router.use(authMiddleware);

// Get all notifications
router.get('/', notificationController.getNotifications.bind(notificationController));

// Get unread count
router.get('/unread-count', notificationController.getUnreadCount.bind(notificationController));

// Mark notification as read
router.patch('/:id/read', notificationController.markAsRead.bind(notificationController));

// Mark all as read
router.post('/read-all', notificationController.markAllAsRead.bind(notificationController));

// Delete notification
router.delete('/:id', notificationController.deleteNotification.bind(notificationController));

// Delete all read notifications
router.delete('/read/all', notificationController.deleteAllRead.bind(notificationController));

// Mark relocation notifications for an attendance as read (when supervisor opens that conversation)
router.post(
  '/mark-read-by-attendance/:attendanceId',
  notificationController.markRelocationAsReadByAttendance.bind(notificationController)
);

export default router;
