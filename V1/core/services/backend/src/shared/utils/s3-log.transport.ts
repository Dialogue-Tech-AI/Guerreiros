/**
 * Winston transport that uploads logs to S3 (AWS) or MinIO (S3-compatible)
 *
 * - Dev (IS_PRODUCTION=false): uses MinIO bucket
 * - Prod (IS_PRODUCTION=true + USE_AWS_STORAGE): uses AWS S3 bucket
 *
 * Buffers logs and uploads periodically to avoid excessive API calls.
 */
import Transport from 'winston-transport';
import { IStorage } from '../infrastructure/storage/storage.interface';
import { randomBytes } from 'crypto';

export interface S3LogTransportOptions extends Transport.TransportStreamOptions {
  storage: IStorage;
  bucket: string;
  /** Flush interval in ms (default: 30000 = 30s) */
  flushInterval?: number;
  /** Max lines before flush (default: 50) */
  maxBufferSize?: number;
}

export class S3LogTransport extends Transport {
  private storage: IStorage;
  private bucket: string;
  private buffer: string[] = [];
  private flushInterval: number;
  private maxBufferSize: number;
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(opts: S3LogTransportOptions) {
    super(opts);
    this.storage = opts.storage;
    this.bucket = opts.bucket;
    this.flushInterval = opts.flushInterval ?? 30000;
    this.maxBufferSize = opts.maxBufferSize ?? 50;

    this.startFlushTimer();
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  log(info: Record<string, unknown>, callback: () => void): void {
    setImmediate(() => {
      this.emit('logged', info);
    });

    try {
      const message =
        typeof info.message === 'object'
          ? JSON.stringify(info.message)
          : String(info.message);
      const line = [
        info.timestamp,
        `[${String(info.level).toUpperCase()}]`,
        message,
        Object.keys(info).length > 2 ? JSON.stringify({ ...info, message: undefined, level: undefined, timestamp: undefined }) : '',
      ]
        .filter(Boolean)
        .join(' ');

      this.buffer.push(line);

      if (this.buffer.length >= this.maxBufferSize) {
        this.flush();
      }
    } catch (err) {
      console.error('[S3LogTransport] Error buffering log:', err);
    }

    callback();
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.flushing) return;
    this.flushing = true;
    const lines = this.buffer.splice(0, this.buffer.length);
    const content = lines.join('\n');

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '-');
    const suffix = randomBytes(4).toString('hex');
    const key = `logs/${dateStr}/altese-${timeStr}-${suffix}.log`;

    try {
      await this.storage.ensureBucket(this.bucket);
      await this.storage.uploadFile(
        this.bucket,
        key,
        Buffer.from(content, 'utf-8'),
        'text/plain'
      );
    } catch (err) {
      console.error('[S3LogTransport] Error uploading logs to storage:', err);
      // Re-queue failed logs to try again
      this.buffer.unshift(...lines);
    } finally {
      this.flushing = false;
    }
  }

  close(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}
