import * as Minio from 'minio';
import { IStorage } from './storage.interface';
import config from '../../../config/app.config';
import { logger } from '../../utils/logger';

export class MinIOStorage implements IStorage {
  private client: Minio.Client;

  constructor() {
    this.client = new Minio.Client({
      endPoint: config.minio.endpoint,
      port: config.minio.port,
      useSSL: config.minio.useSSL,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    });

    this.initializeBuckets();
  }

  private async initializeBuckets(): Promise<void> {
    try {
      // Ensure default buckets exist
      await this.ensureBucket(config.minio.buckets.attachments);
      await this.ensureBucket(config.minio.buckets.media);
      await this.ensureBucket(config.minio.buckets.logs);
      logger.info('MinIO storage initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MinIO buckets:', error);
    }
  }

  async uploadFile(
    bucket: string,
    fileName: string,
    file: Buffer,
    contentType: string = 'application/octet-stream'
  ): Promise<string> {
    try {
      await this.ensureBucket(bucket);

      await this.client.putObject(bucket, fileName, file, file.length, {
        'Content-Type': contentType,
      });

      logger.debug(`File ${fileName} uploaded to bucket ${bucket}`);
      return fileName;
    } catch (error) {
      logger.error(`Error uploading file ${fileName} to bucket ${bucket}:`, error);
      throw error;
    }
  }

  async downloadFile(bucket: string, fileName: string): Promise<Buffer> {
    try {
      const stream = await this.client.getObject(bucket, fileName);
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error) {
      logger.error(`Error downloading file ${fileName} from bucket ${bucket}:`, error);
      throw error;
    }
  }

  async deleteFile(bucket: string, fileName: string): Promise<void> {
    try {
      await this.client.removeObject(bucket, fileName);
      logger.debug(`File ${fileName} deleted from bucket ${bucket}`);
    } catch (error) {
      logger.error(`Error deleting file ${fileName} from bucket ${bucket}:`, error);
      throw error;
    }
  }

  async fileExists(bucket: string, fileName: string): Promise<boolean> {
    try {
      await this.client.statObject(bucket, fileName);
      return true;
    } catch (error: any) {
      if (error.code === 'NotFound') {
        return false;
      }
      logger.error(`Error checking file existence ${fileName} in bucket ${bucket}:`, error);
      throw error;
    }
  }

  async getFileUrl(bucket: string, fileName: string, expiresIn: number = 3600): Promise<string> {
    try {
      const url = await this.client.presignedGetObject(bucket, fileName, expiresIn);
      return url;
    } catch (error) {
      logger.error(`Error generating URL for file ${fileName} in bucket ${bucket}:`, error);
      throw error;
    }
  }

  async listFiles(bucket: string, prefix: string = ''): Promise<string[]> {
    try {
      const stream = this.client.listObjects(bucket, prefix, true);
      const files: string[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', (obj) => {
          if (obj.name) {
            files.push(obj.name);
          }
        });
        stream.on('end', () => resolve(files));
        stream.on('error', reject);
      });
    } catch (error) {
      logger.error(`Error listing files in bucket ${bucket}:`, error);
      throw error;
    }
  }

  async ensureBucket(bucket: string): Promise<void> {
    try {
      const exists = await this.client.bucketExists(bucket);
      
      if (!exists) {
        await this.client.makeBucket(bucket, 'us-east-1');
        logger.info(`Bucket ${bucket} created successfully`);
      }
    } catch (error) {
      logger.error(`Error ensuring bucket ${bucket}:`, error);
      throw error;
    }
  }

  async getFileMetadata(
    bucket: string,
    fileName: string
  ): Promise<{ size: number; lastModified: Date; contentType: string }> {
    try {
      const stat = await this.client.statObject(bucket, fileName);
      
      return {
        size: stat.size,
        lastModified: stat.lastModified,
        contentType: stat.metaData?.['content-type'] || 'application/octet-stream',
      };
    } catch (error) {
      logger.error(`Error getting file metadata ${fileName} from bucket ${bucket}:`, error);
      throw error;
    }
  }
}
