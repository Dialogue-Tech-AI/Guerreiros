import api from './api';

export interface Notification {
  id: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  attendanceId?: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationResponse {
  notifications: Notification[];
  total: number;
  unreadCount: number;
}

class NotificationService {
  /**
   * Get all notifications
   */
  async getNotifications(limit: number = 50, offset: number = 0): Promise<NotificationResponse> {
    const response = await api.get(`/notifications?limit=${limit}&offset=${offset}`);
    return response.data.data;
  }

  /**
   * Get unread count
   */
  async getUnreadCount(): Promise<number> {
    const response = await api.get('/notifications/unread-count');
    return response.data.data.count;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    await api.patch(`/notifications/${notificationId}/read`);
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<void> {
    await api.post('/notifications/read-all');
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    await api.delete(`/notifications/${notificationId}`);
  }

  /**
   * Delete all read notifications
   */
  async deleteAllRead(): Promise<number> {
    const response = await api.delete('/notifications/read/all');
    return response.data.data.count;
  }

  /**
   * Mark relocation notifications for an attendance as read (when supervisor opens that conversation)
   */
  async markRelocationAsReadByAttendance(attendanceId: string): Promise<{ markedCount: number }> {
    const response = await api.post<{ success: boolean; data: { markedCount: number } }>(
      `/notifications/mark-read-by-attendance/${attendanceId}`
    );
    return response.data.data;
  }
}

export default new NotificationService();
