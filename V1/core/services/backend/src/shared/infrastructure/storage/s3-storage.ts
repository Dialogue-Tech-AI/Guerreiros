import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IStorage } from './storage.interface';
import { awsConfig } from '../aws/aws.config';
import { logger } from '../../utils/logger';

/**
 * S3 adapter for production
 * 
 * NOTE: This will be used ONLY when:
 * - NODE_ENV=production
 * - USE_AWS_STORAGE=true
 * - S3 buckets are configured in AWS
 */
export class S3Storage implements IStorage {
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: awsConfig.region,
      credentials: awsConfig.credentials,
    });

    logger.info('S3 Storage (AWS) initialized');
  }

  async uploadFile(
    bucket: string,
    fileName: string,
    file: Buffer,
    contentType: string = 'application/octet-stream'
  ): Promise<string> {
    try {
      await this.ensureBucket(bucket);

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: fileName,
        Body: file,
        ContentType: contentType,
      });

      await this.client.send(command);
      logger.debug(`File ${fileName} uploaded to S3 bucket ${bucket}`);
      
      return fileName;
    } catch (error) {
      logger.error(`Error uploading file ${fileName} to S3 bucket ${bucket}:`, error);
      throw error;
    }
  }

  async downloadFile(bucket: string, fileName: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: fileName,
      });

      const response = await this.client.send(command);
      
      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      logger.error(`Error downloading file ${fileName} from S3 bucket ${bucket}:`, error);
      throw error;
    }
  }

  async deleteFile(bucket: string, fileName: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: fileName,
      });

      await this.client.send(command);
      logger.debug(`File ${fileName} deleted from S3 bucket ${bucket}`);
    } catch (error) {
      logger.error(`Error deleting file ${fileName} from S3 bucket ${bucket}:`, error);
      throw error;
    }
  }

  async fileExists(bucket: string, fileName: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: fileName,
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return false;
      }
      logger.error(`Error checking file existence ${fileName} in S3 bucket ${bucket}:`, error);
      throw error;
    }
  }

  async getFileUrl(bucket: string, fileName: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: fileName,
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });
      return url;
    } catch (error) {
      logger.error(`Error generating URL for file ${fileName} in S3 bucket ${bucket}:`, error);
      throw error;
    }
  }

  async listFiles(bucket: string, prefix: string = ''): Promise<string[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
      });

      const response = await this.client.send(command);
      return (response.Contents || []).map((obj) => obj.Key!).filter(Boolean);
    } catch (error) {
      logger.error(`Error listing files in S3 bucket ${bucket}:`, error);
      throw error;
    }
  }

  async ensureBucket(bucket: string): Promise<void> {
    try {
      // Check if bucket exists
      const headCommand = new HeadBucketCommand({ Bucket: bucket });
      await this.client.send(headCommand);
    } catch (error: any) {
      if (error.name === 'NotFound') {
        // Bucket doesn't exist, create it
        try {
          const createCommand = new CreateBucketCommand({ Bucket: bucket });
          await this.client.send(createCommand);
          logger.info(`S3 bucket ${bucket} created successfully`);
        } catch (createError) {
          logger.error(`Error creating S3 bucket ${bucket}:`, createError);
          throw createError;
        }
      } else {
        throw error;
      }
    }
  }

  async getFileMetadata(
    bucket: string,
    fileName: string
  ): Promise<{ size: number; lastModified: Date; contentType: string }> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: fileName,
      });

      const response = await this.client.send(command);

      return {
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        contentType: response.ContentType || 'application/octet-stream',
      };
    } catch (error) {
      logger.error(`Error getting file metadata ${fileName} from S3 bucket ${bucket}:`, error);
      throw error;
    }
  }
}
