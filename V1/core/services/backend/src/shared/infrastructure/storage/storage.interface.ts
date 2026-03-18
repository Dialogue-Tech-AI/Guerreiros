export interface IStorage {
  /**
   * Upload file to storage
   */
  uploadFile(
    bucket: string,
    fileName: string,
    file: Buffer,
    contentType?: string
  ): Promise<string>;

  /**
   * Download file from storage
   */
  downloadFile(bucket: string, fileName: string): Promise<Buffer>;

  /**
   * Delete file from storage
   */
  deleteFile(bucket: string, fileName: string): Promise<void>;

  /**
   * Check if file exists
   */
  fileExists(bucket: string, fileName: string): Promise<boolean>;

  /**
   * Get file URL (pre-signed if private)
   */
  getFileUrl(bucket: string, fileName: string, expiresIn?: number): Promise<string>;

  /**
   * List files in bucket
   */
  listFiles(bucket: string, prefix?: string): Promise<string[]>;

  /**
   * Create bucket if it doesn't exist
   */
  ensureBucket(bucket: string): Promise<void>;

  /**
   * Get file metadata
   */
  getFileMetadata(bucket: string, fileName: string): Promise<{
    size: number;
    lastModified: Date;
    contentType: string;
  }>;
}
