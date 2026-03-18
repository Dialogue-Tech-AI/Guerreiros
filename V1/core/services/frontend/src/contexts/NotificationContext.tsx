import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { socketService } from '../services/socket.service';
import notificationService, { Notification } from '../services/notification.service';
import { useAuthStore } from '../store/auth.store';
import toast from 'react-hot-toast';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  loadNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  markRelocationAsReadByAttendance: (attendanceId: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  deleteAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    if (!user || !isAuthenticated) {
      // Reset state if user is not authenticated
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    try {
      setLoading(true);
      const data = await notificationService.getNotifications(50, 0);
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (error: any) {
      // Silently fail - don't show error toast on initial load
      // Network/CORS errors are expected if backend is down or not accessible
      const isNetworkError = 
        error?.code === 'ERR_NETWORK' || 
        error?.code === 'ERR_CANCELED' ||
        error?.message?.includes('Network Error') ||
        error?.message?.includes('CORS') ||
        !error?.response; // No response means network issue
      
      if (!isNetworkError) {
        console.error('Error loading notifications:', error);
      }
      
      // Don't reset state on network errors - keep existing notifications
      // Only reset if it's an auth error
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } finally {
      setLoading(false);
    }
  }, [user, isAuthenticated]);

  // Mark as read
  const markAsRead = useCallback(async (id: string) => {
    try {
      await notificationService.markAsRead(id);
      
      // Update local state
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
      toast.error('Erro ao marcar notificação como lida');
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      await notificationService.markAllAsRead();
      
      // Update local state
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
      
      toast.success('Todas as notificações marcadas como lidas');
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast.error('Erro ao marcar todas como lidas');
    }
  }, []);

  const markRelocationAsReadByAttendance = useCallback(async (attendanceId: string) => {
    try {
      const { markedCount } = await notificationService.markRelocationAsReadByAttendance(attendanceId);
      if (markedCount > 0) {
        setNotifications(prev =>
          prev.map(n =>
            n.attendanceId === attendanceId && n.type === 'ATTENDANCE_RELOCATED_INTERVENTION'
              ? { ...n, isRead: true }
              : n
          )
        );
        setUnreadCount(prev => Math.max(0, prev - markedCount));
      }
    } catch (error) {
      console.error('Error marking relocation notifications as read:', error);
    }
  }, []);

  // Delete notification
  const deleteNotification = useCallback(async (id: string) => {
    try {
      await notificationService.deleteNotification(id);
      
      // Update local state
      const notification = notifications.find(n => n.id === id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      
      if (notification && !notification.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      
      toast.success('Notificação excluída');
    } catch (error) {
      console.error('Error deleting notification:', error);
      toast.error('Erro ao excluir notificação');
    }
  }, [notifications]);

  // Delete all read
  const deleteAllRead = useCallback(async () => {
    try {
      const count = await notificationService.deleteAllRead();
      
      // Update local state
      setNotifications(prev => prev.filter(n => !n.isRead));
      
      toast.success(`${count} notificações lidas excluídas`);
    } catch (error) {
      console.error('Error deleting read notifications:', error);
      toast.error('Erro ao excluir notificações lidas');
    }
  }, []);

  // Socket.IO event handlers
  useEffect(() => {
    if (!user || !isAuthenticated) {
      // Disconnect if user is not authenticated
      return;
    }

    try {
      const userRoomId = user.id || (user as any).sub;
      if (!userRoomId) return;
      // Join user's room
      if (socketService.isConnected()) {
        socketService.emit('join_room', `user_${userRoomId}`);
      } else {
        socketService.connect();
        // Wait a bit for connection, then join room
        setTimeout(() => {
          if (socketService.isConnected()) {
            socketService.emit('join_room', `user_${userRoomId}`);
          }
        }, 500);
      }
    } catch (error) {
      // Silently fail - Socket.IO connection errors are handled by socket.service
      console.debug('Socket.IO connection attempt:', error);
    }

    const handleNewNotification = (data: Notification) => {
      setNotifications(prev => [data, ...prev]);
      setUnreadCount(prev => prev + 1);
      if (data.type !== 'ATTENDANCE_RELOCATED_INTERVENTION') {
        toast.success(data.title, { icon: '🔔', duration: 4000, position: 'top-right' });
      }
    };

    // Handle unread count update
    const handleUnreadCount = (data: { count: number }) => {
      console.log('Unread count updated:', data.count);
      setUnreadCount(data.count);
    };

    // Register Socket.IO listeners
    socketService.on('notification:new', handleNewNotification);
    socketService.on('notification:unread_count', handleUnreadCount);

    // Cleanup
    return () => {
      socketService.off('notification:new', handleNewNotification);
      socketService.off('notification:unread_count', handleUnreadCount);
    };
  }, [user, isAuthenticated]);

  // Load notifications on mount (only if user is authenticated)
  useEffect(() => {
    if (user?.sub && isAuthenticated) {
      // Small delay to ensure auth token is set
      const timer = setTimeout(() => {
        loadNotifications();
      }, 500);
      
      return () => clearTimeout(timer);
    } else {
      // Clear notifications if user logs out
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [user?.sub, isAuthenticated, loadNotifications]);

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    loading,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    markRelocationAsReadByAttendance,
    deleteNotification,
    deleteAllRead,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

// Marcar hook como compatível com Fast Refresh
// @refresh reset
export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};
