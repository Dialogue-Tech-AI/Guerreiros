import Redis, { Redis as RedisClient } from 'ioredis';
import { ICache } from './cache.interface';
import config from '../../../config/app.config';
import { logger } from '../../utils/logger';

export class RedisCache implements ICache {
  private client: RedisClient;
  private subscriber: RedisClient;
  private subscriptions: Map<string, (message: string) => void>;

  constructor() {
    this.client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn(`Redis connection retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.subscriber = this.client.duplicate();
    this.subscriptions = new Map();

    this.client.on('connect', () => {
      logger.info('Redis cache connected successfully');
    });

    this.client.on('error', (error) => {
      logger.error('Redis cache error:', error);
    });

    this.subscriber.on('message', (channel, message) => {
      const callback = this.subscriptions.get(channel);
      if (callback) {
        callback(message);
      }
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Error getting key ${key} from cache:`, error);
      return null;
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      logger.error(`Error setting key ${key} in cache:`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error(`Error deleting key ${key} from cache:`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Error checking existence of key ${key}:`, error);
      return false;
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.client.expire(key, seconds);
    } catch (error) {
      logger.error(`Error setting expiration for key ${key}:`, error);
      throw error;
    }
  }

  async mget<T>(...keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.client.mget(...keys);
      return values.map((value) => (value ? JSON.parse(value) as T : null));
    } catch (error) {
      logger.error('Error getting multiple keys from cache:', error);
      return keys.map(() => null);
    }
  }

  async mset(keyValues: Record<string, unknown>, ttl?: number): Promise<void> {
    try {
      const pipeline = this.client.pipeline();
      
      Object.entries(keyValues).forEach(([key, value]) => {
        const serialized = JSON.stringify(value);
        if (ttl) {
          pipeline.setex(key, ttl, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      });

      await pipeline.exec();
    } catch (error) {
      logger.error('Error setting multiple keys in cache:', error);
      throw error;
    }
  }

  async increment(key: string, by: number = 1): Promise<number> {
    try {
      return await this.client.incrby(key, by);
    } catch (error) {
      logger.error(`Error incrementing key ${key}:`, error);
      throw error;
    }
  }

  async decrement(key: string, by: number = 1): Promise<number> {
    try {
      return await this.client.decrby(key, by);
    } catch (error) {
      logger.error(`Error decrementing key ${key}:`, error);
      throw error;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error(`Error getting keys with pattern ${pattern}:`, error);
      return [];
    }
  }

  async clear(): Promise<void> {
    try {
      await this.client.flushdb();
      logger.info('Cache cleared successfully');
    } catch (error) {
      logger.error('Error clearing cache:', error);
      throw error;
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    try {
      await this.client.publish(channel, message);
    } catch (error) {
      logger.error(`Error publishing to channel ${channel}:`, error);
      throw error;
    }
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    try {
      this.subscriptions.set(channel, callback);
      await this.subscriber.subscribe(channel);
      logger.info(`Subscribed to channel: ${channel}`);
    } catch (error) {
      logger.error(`Error subscribing to channel ${channel}:`, error);
      throw error;
    }
  }

  async unsubscribe(channel: string): Promise<void> {
    try {
      this.subscriptions.delete(channel);
      await this.subscriber.unsubscribe(channel);
      logger.info(`Unsubscribed from channel: ${channel}`);
    } catch (error) {
      logger.error(`Error unsubscribing from channel ${channel}:`, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      await this.subscriber.quit();
      logger.info('Redis cache disconnected');
    } catch (error) {
      logger.error('Error disconnecting from Redis cache:', error);
      throw error;
    }
  }
}
