import { ICache } from '../cache/cache.interface';
import { RedisCache } from '../cache/redis-cache';
import { IQueue } from '../queue/queue.interface';
import { RabbitMQQueue } from '../queue/rabbitmq-queue';
import { SQSQueue } from '../queue/sqs-queue';
import { IStorage } from '../storage/storage.interface';
import { MinIOStorage } from '../storage/minio-storage';
import { S3Storage } from '../storage/s3-storage';
import config from '../../../config/app.config';
import { logger } from '../../utils/logger';

/**
 * Factory Pattern for Infrastructure Services
 * 
 * In DEVELOPMENT:
 * - Always uses Docker Compose services (Redis, RabbitMQ, MinIO)
 * 
 * In PRODUCTION:
 * - Uses AWS services (ElastiCache, SQS, S3) when USE_AWS_* flags are enabled
 * - Otherwise falls back to Docker Compose services
 * 
 * This allows code to be ready for AWS deployment without requiring
 * AWS infrastructure during development.
 */
export class InfrastructureFactory {
  private static cacheInstance: ICache | null = null;
  private static queueInstance: IQueue | null = null;
  private static storageInstance: IStorage | null = null;

  /**
   * Create Cache instance (Redis or ElastiCache)
   */
  static createCache(): ICache {
    if (this.cacheInstance) {
      return this.cacheInstance;
    }

    // In development, ALWAYS use Redis from Docker Compose
    if (config.app.isDevelopment) {
      logger.info('Using Redis Cache (Docker Compose)');
      this.cacheInstance = new RedisCache();
      return this.cacheInstance;
    }

    // In production, use AWS ElastiCache only if explicitly enabled
    if (config.app.isProduction && config.aws.useCache) {
      logger.info('Using ElastiCache (AWS) - NOT IMPLEMENTED YET, falling back to Redis');
      // TODO: Implement ElastiCache adapter when ready
      // this.cacheInstance = new ElastiCacheCache();
      this.cacheInstance = new RedisCache();
      return this.cacheInstance;
    }

    // Default: Use Redis
    logger.info('Using Redis Cache (Default)');
    this.cacheInstance = new RedisCache();
    return this.cacheInstance;
  }

  /**
   * Create Queue instance (RabbitMQ or SQS)
   */
  static createQueue(): IQueue {
    if (this.queueInstance) {
      return this.queueInstance;
    }

    // In development, ALWAYS use RabbitMQ from Docker Compose
    if (config.app.isDevelopment) {
      logger.info('Using RabbitMQ Queue (Docker Compose)');
      this.queueInstance = new RabbitMQQueue();
      return this.queueInstance;
    }

    // In production, use AWS SQS only if explicitly enabled
    if (config.app.isProduction && config.aws.useQueue) {
      logger.info('Using SQS Queue (AWS)');
      this.queueInstance = new SQSQueue();
      return this.queueInstance;
    }

    // Default: Use RabbitMQ
    logger.info('Using RabbitMQ Queue (Default)');
    this.queueInstance = new RabbitMQQueue();
    return this.queueInstance;
  }

  /**
   * Create Storage instance (MinIO or S3)
   */
  static createStorage(): IStorage {
    if (this.storageInstance) {
      return this.storageInstance;
    }

    // In development, ALWAYS use MinIO from Docker Compose
    if (config.app.isDevelopment) {
      logger.info('Using MinIO Storage (Docker Compose)');
      this.storageInstance = new MinIOStorage();
      return this.storageInstance;
    }

    // In production, use AWS S3 only if explicitly enabled
    if (config.app.isProduction && config.aws.useStorage) {
      logger.info('Using S3 Storage (AWS)');
      this.storageInstance = new S3Storage();
      return this.storageInstance;
    }

    // Default: Use MinIO
    logger.info('Using MinIO Storage (Default)');
    this.storageInstance = new MinIOStorage();
    return this.storageInstance;
  }

  /**
   * Close all connections
   */
  static async closeAll(): Promise<void> {
    try {
      if (this.cacheInstance) {
        await this.cacheInstance.disconnect();
        this.cacheInstance = null;
      }

      if (this.queueInstance) {
        await this.queueInstance.disconnect();
        this.queueInstance = null;
      }

      // Storage doesn't need explicit disconnection

      logger.info('All infrastructure connections closed');
    } catch (error) {
      logger.error('Error closing infrastructure connections:', error);
      throw error;
    }
  }
}

// Export singleton instances
export const cache = InfrastructureFactory.createCache();
export const queue = InfrastructureFactory.createQueue();
export const storage = InfrastructureFactory.createStorage();
