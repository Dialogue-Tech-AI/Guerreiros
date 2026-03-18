import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';

// Socket.IO: same-origin quando VITE_API_URL não definido (evita bloqueio por ad blockers)
const getSocketUrl = (): string | undefined => {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) return undefined; // same-origin
  return apiUrl.replace(/\/api$/, '');
};

class SocketService {
  private socket: Socket | null = null;
  /** event -> (userCallback -> wrappedCallback). Wrapped is what we register on socket; we must off(wrapped) to remove. */
  private listeners: Map<string, Map<(data: any) => void, (data: any) => void>> = new Map();
  private isConnecting: boolean = false;
  /** Flag global para prevenir registro duplicado devido ao React StrictMode */
  private eventRegistrationLocks: Map<string, boolean> = new Map();
  /** Rooms pendentes para (re)join após reconexão */
  private pendingRooms: Set<string> = new Set();

  /**
   * Connect to Socket.IO server
   */
  connect(): void {
    if (this.socket?.connected) {
      console.log('Socket already connected');
      return;
    }

    // Prevenir múltiplas tentativas simultâneas de conexão
    if (this.isConnecting) {
      console.log('Socket connection already in progress');
      return;
    }

    this.isConnecting = true;

    // Se já existe um socket desconectado, limpar antes de criar novo
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    // Get auth token for authentication
    const { accessToken } = useAuthStore.getState();

    const socketUrl = getSocketUrl();
    console.log('Connecting to Socket.IO server', { url: socketUrl ?? '(same-origin)' });
    
    this.socket = io(socketUrl ?? undefined, {
      // POLLING PRIMEIRO para compatibilidade com Cloudflare Tunnel
      // WebSocket está bloqueado pelo tunnel, então usamos polling
      transports: ['polling', 'websocket'],
      auth: {
        token: accessToken || undefined,
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      timeout: 20000,
      autoConnect: true,
      forceNew: false,
      // Tentar upgrade para WebSocket se o tunnel permitir
      upgrade: true,
      rememberUpgrade: true,
    });

    this.socket.on('connect', () => {
      console.log('Socket.IO connected', { socketId: this.socket?.id });
      this.isConnecting = false;

      // Re-register listeners after connection (use wrapped callbacks)
      this.listeners.forEach((map, event) => {
        this.socket?.removeAllListeners(event);
        map.forEach((wrapped) => {
          this.socket?.on(event, wrapped);
        });
      });

      // Rejoin automático de rooms após reconexão
      this.pendingRooms.forEach((room) => {
        this.emit('join_room', room);
      });
    });


    // Prevenir spam de logs de erro
    let lastErrorLog = 0;
    const ERROR_LOG_THROTTLE = 5000; // Log erro no máximo a cada 5 segundos

    this.socket.on('connect_error', (error) => {
      const now = Date.now();
      if (now - lastErrorLog > ERROR_LOG_THROTTLE) {
        console.warn('Socket.IO connection error (will retry)', {
          message: error.message,
          type: error.type,
          url: socketUrl ?? '(same-origin)',
        });
        lastErrorLog = now;
      }
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      if (attemptNumber <= 3) {
        console.log(`Socket.IO: Reconnection attempt ${attemptNumber}/3`);
      }
    });

    this.socket.on('reconnect_failed', () => {
      console.error('Socket.IO: Reconnection failed after all attempts. Please check server connection.');
      this.isConnecting = false;
    });

    // Reset connecting flag on disconnect
    this.socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected', { reason });
      if (reason === 'io server disconnect') {
        // Server disconnected, don't try to reconnect automatically
        this.isConnecting = false;
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('Socket.IO: Reconnected successfully', { attemptNumber });
    });

  }

  /**
   * Disconnect from Socket.IO server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.listeners.clear();
      console.log('Socket.IO disconnected and listeners cleared');
    }
  }

  /**
   * Subscribe to an event
   */
  on(event: string, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Map());
    }
    const map = this.listeners.get(event)!;

    // PROTEÇÃO 1: Verificar se callback específico já foi registrado
    if (map.has(callback)) {
      console.warn(`⚠️ Listener já registrado para ${event} (mesma referência), ignorando`);
      return;
    }

    // PROTEÇÃO 2 (CRÍTICA): Para eventos principais, limitar a apenas 1 listener no nosso Map
    // Previne duplicação causada por React StrictMode que remonta componente
    const criticalEvents = ['message_received', 'message_sent', 'new_unassigned_message', 'attendance:routed', 'client:typing'];
    
    if (criticalEvents.includes(event) && map.size >= 1) {
      console.warn(`⚠️ Evento ${event} já tem ${map.size} listener(s) registrado(s) no Map. Bloqueando duplicata (React StrictMode).`);
      return;
    }

    if (this.socket) {
      const wrappedCallback = (data: any) => {
        callback(data);
      };
      map.set(callback, wrappedCallback);
      this.socket.on(event, wrappedCallback);
      console.log(`✅ Registered Socket.IO listener for event: ${event}`, {
        isConnected: this.socket.connected,
        socketId: this.socket.id,
        mapSize: map.size,
      });
    } else {
      console.warn(`⚠️ Cannot register listener for ${event}: socket not initialized`);
    }
  }

  /**
   * Unsubscribe from an event. Must pass the same callback reference used in on().
   */
  off(event: string, callback?: (data: any) => void): void {
    if (callback) {
      const map = this.listeners.get(event);
      const wrapped = map?.get(callback);
      if (wrapped && this.socket) {
        this.socket.off(event, wrapped);
        console.log(`🗑️ Removed listener for event: ${event}, remaining: ${map ? map.size - 1 : 0}`);
      }
      map?.delete(callback);
    } else {
      this.listeners.delete(event);
      if (this.socket) {
        this.socket.removeAllListeners(event);
        console.log(`🗑️ Removed ALL listeners for event: ${event}`);
      }
    }
  }

  /**
   * Emit an event to the server
   */
  emit(event: string, data?: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit event', event);
      // Queue the event to emit when connected
      if (this.socket) {
        this.socket.once('connect', () => {
          this.socket?.emit(event, data);
        });
      }
    }
  }

  /**
   * Join a room (only works when connected)
   */
  joinRoom(room: string): void {
    this.pendingRooms.add(room);

    if (this.socket?.connected) {
      this.emit('join_room', room);
    } else {
      // Wait for connection before joining room
      if (this.socket) {
        this.socket.once('connect', () => {
          console.log('Socket connected, joining room:', room);
          this.emit('join_room', room);
        });
      } else {
        // If socket doesn't exist yet, wait a bit and try again
        setTimeout(() => {
          if (this.socket?.connected) {
            this.emit('join_room', room);
          } else if (this.socket) {
            this.socket.once('connect', () => {
              console.log('Socket connected (delayed), joining room:', room);
              this.emit('join_room', room);
            });
          }
        }, 100);
      }
    }
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// Singleton instance
export const socketService = new SocketService();