import React, { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../../contexts/NotificationContext';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const NotificationBell: React.FC = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, deleteAllRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Filter notifications
  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread') {
      return !n.isRead;
    }
    return true;
  });

  // Get notification icon
  const getNotificationIcon = (type: string, priority: string) => {
    if (priority === 'URGENT') return '🚨';
    if (priority === 'HIGH') return '❗';
    
    switch (type) {
      case 'NEW_MESSAGE':
        return '💬';
      case 'ATTENDANCE_ROUTED':
        return '🔀';
      case 'ATTENDANCE_ASSIGNED':
        return '👤';
      case 'ATTENDANCE_CLOSED':
        return '✅';
      case 'SYSTEM':
        return '⚙️';
      default:
        return '🔔';
    }
  };

  // Get notification color
  const getNotificationColor = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return 'bg-red-50 border-red-200';
      case 'HIGH':
        return 'bg-orange-50 border-orange-200';
      case 'MEDIUM':
        return 'bg-blue-50 border-blue-200';
      case 'LOW':
        return 'bg-gray-50 border-gray-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  // Handle notification click
  const handleNotificationClick = async (notification: any) => {
    // Mark as read
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }

    // Navigate to action URL if exists
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary rounded-full transition-colors"
      >
        <span className="material-icons-round text-2xl">notifications</span>
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-2xl border border-gray-200 z-50">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Notificações</h3>
              <span className="text-sm text-gray-500">
                {unreadCount} não {unreadCount === 1 ? 'lida' : 'lidas'}
              </span>
            </div>

            {/* Filter Tabs */}
            <div className="flex space-x-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  filter === 'all'
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  filter === 'unread'
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Não lidas
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto custom-scrollbar">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <span className="material-icons-round text-5xl mb-2">notifications_off</span>
                <p>Nenhuma notificação</p>
              </div>
            ) : (
              filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 border-b border-gray-100 cursor-pointer transition-colors ${
                    notification.isRead ? 'bg-white' : getNotificationColor(notification.priority)
                  } hover:bg-gray-50`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start space-x-3">
                    {/* Icon */}
                    <div className="text-2xl flex-shrink-0">
                      {getNotificationIcon(notification.type, notification.priority)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <p className={`text-sm font-medium ${notification.isRead ? 'text-gray-700' : 'text-gray-900'}`}>
                          {notification.title}
                        </p>
                        
                        {/* Actions */}
                        <div className="flex items-center space-x-1 ml-2">
                          {!notification.isRead && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsRead(notification.id);
                              }}
                              className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                              title="Marcar como lida"
                            >
                              <span className="material-icons-round text-sm">mark_email_read</span>
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notification.id);
                            }}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            title="Excluir"
                          >
                            <span className="material-icons-round text-sm">delete</span>
                          </button>
                        </div>
                      </div>

                      <p className={`text-sm mt-1 ${notification.isRead ? 'text-gray-500' : 'text-gray-700'}`}>
                        {notification.message}
                      </p>

                      <p className="text-xs text-gray-400 mt-1">
                        {formatDistanceToNow(new Date(notification.createdAt), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Actions */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-gray-200 flex justify-between">
              <button
                onClick={markAllAsRead}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Marcar todas como lidas
              </button>
              <button
                onClick={deleteAllRead}
                className="text-sm text-red-600 hover:text-red-800 font-medium transition-colors"
              >
                Excluir lidas
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
