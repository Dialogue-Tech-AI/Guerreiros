/**
 * Redis Service for Cache and Pub/Sub
 */
import Redis from 'ioredis';
import { logger } from '../../utils/logger';

export class RedisService {
  private static instance: RedisService;
  private client: Redis | null = null;
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private subscriberCallbacks: Map<string, (message: string) => void> = new Map();
  private subscriberHandlerAttached = false;

  // Redis channels
  public static readonly CHANNEL_CONFIG_UPDATE = 'ai:config:update';
  /** Canal para notificar frontend quando atendimento é movido para intervenção (ex.: demanda-telefone-fixo). */
  public static readonly CHANNEL_INTERVENTION_ASSIGNED = 'attendance:intervention-assigned';

  private constructor() {}

  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  /**
   * Connect to Redis
   */
  public async connect(): Promise<void> {
    try {
      const redisHost = process.env.REDIS_HOST || 'localhost';
      const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
      const redisPassword = process.env.REDIS_PASSWORD;
      const redisDb = parseInt(process.env.REDIS_DB || '0', 10);

      // Create main client
      this.client = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        db: redisDb,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: true,
      });

      // Create publisher client (separate for pub/sub)
      this.publisher = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        db: redisDb,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      // Create subscriber client (dedicated connection for subscribe)
      this.subscriber = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        db: redisDb,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      this.subscriber.on('error', (error) => {
        logger.error('Redis subscriber error', { error: error.message });
      });

      // Event listeners
      this.client.on('connect', () => {
        logger.info('Redis client connected', {
          host: redisHost,
          port: redisPort,
          db: redisDb,
        });
      });

      this.client.on('error', (error) => {
        logger.error('Redis client error', { error: error.message });
      });

      this.publisher.on('error', (error) => {
        logger.error('Redis publisher error', { error: error.message });
      });

      // Test connection
      await this.client.ping();
      logger.info('✅ Redis connected successfully');
    } catch (error: any) {
      logger.error('Failed to connect to Redis', { error: error.message });
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.subscriber) {
        await this.subscriber.quit();
        this.subscriber = null;
      }
      if (this.client) {
        await this.client.quit();
      }
      if (this.publisher) {
        await this.publisher.quit();
      }
      logger.info('Redis disconnected');
    } catch (error: any) {
      logger.error('Error disconnecting from Redis', { error: error.message });
    }
  }

  /**
   * Publish message to a channel
   */
  public async publish(channel: string, message: string): Promise<void> {
    if (!this.publisher) {
      throw new Error('Redis publisher not connected');
    }

    try {
      await this.publisher.publish(channel, message);
      logger.info('📢 Published to Redis channel', {
        channel,
        message,
      });
    } catch (error: any) {
      logger.error('Error publishing to Redis', {
        channel,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Publish AI config update event
   * This will notify all ai-workers to invalidate their cache
   */
  public async publishConfigUpdate(configKey: string, toolName?: string): Promise<void> {
    if (configKey === 'function_call' && toolName) {
      // For function calls, publish to specific channel
      const channel = `config:function_call:${toolName}:updated`;
      await this.publish(channel, toolName);
      logger.info('🔄 Published function call prompt update event', { toolName, channel });
    } else {
      // For other configs (agent_prompt, pending_functions)
      await this.publish(RedisService.CHANNEL_CONFIG_UPDATE, configKey);
      logger.info('🔄 Published config update event', { configKey });
    }
  }

  /**
   * Get client instance
   */
  public getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }
    return this.client;
  }

  /**
   * Set cache value with optional expiration
   */
  public async set(
    key: string,
    value: string,
    expirationSeconds?: number
  ): Promise<void> {
    const client = this.getClient();
    if (expirationSeconds) {
      await client.setex(key, expirationSeconds, value);
    } else {
      await client.set(key, value);
    }
  }

  /**
   * Get cache value
   */
  public async get(key: string): Promise<string | null> {
    const client = this.getClient();
    return await client.get(key);
  }

  /**
   * Delete cache value
   */
  public async del(key: string): Promise<void> {
    const client = this.getClient();
    await client.del(key);
  }

  /**
   * Check if Redis is connected
   */
  public isConnected(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }

  /**
   * Subscribe to a channel. Callback receives the message string.
   * Uses a dedicated subscriber connection. Single handler dispatches by channel.
   */
  public async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    if (!this.subscriber) {
      throw new Error('Redis subscriber not connected');
    }
    this.subscriberCallbacks.set(channel, callback);
    if (!this.subscriberHandlerAttached) {
      this.subscriberHandlerAttached = true;
      this.subscriber.on('message', (ch, message) => {
        this.subscriberCallbacks.get(ch)?.(message);
      });
    }
    await this.subscriber.subscribe(channel);
    logger.info('Subscribed to Redis channel', { channel });
  }
}

// Export singleton instance
export const redisService = RedisService.getInstance();
