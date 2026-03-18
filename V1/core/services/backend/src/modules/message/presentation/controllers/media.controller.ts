import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { Message } from '../../domain/entities/message.entity';
import { Attendance } from '../../../attendance/domain/entities/attendance.entity';
import { Seller } from '../../../seller/domain/entities/seller.entity';
import { logger } from '../../../../shared/utils/logger';
import { UUID, UserRole } from '../../../../shared/types/common.types';
import { mediaService } from '../../application/services/media.service';

// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 16 * 1024 * 1024, // 16MB max
  },
});

export class MediaController {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Upload media file
    this.router.post('/upload', upload.single('file'), this.uploadMedia.bind(this));

    // Get media URL for a specific message
    this.router.get('/:messageId/url', this.getMediaUrl.bind(this));

    // Get media file directly (stream)
    this.router.get('/:messageId', this.getMedia.bind(this));

    // Download media file
    this.router.get('/:messageId/download', this.downloadMedia.bind(this));
  }

  /**
   * Upload media file
   */
  private async uploadMedia(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.sub;
      const userRole = (req as any).user?.role;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No file provided' });
        return;
      }

      const file = req.file;
      const buffer = file.buffer;
      const mimeType = file.mimetype;

      // Determine media type based on MIME type
      let mediaType = 'document';
      if (mimeType.startsWith('image/')) {
        mediaType = 'image';
      } else if (mimeType.startsWith('video/')) {
        mediaType = 'video';
      } else if (mimeType.startsWith('audio/')) {
        mediaType = 'audio';
      }

      // Generate unique file name
      const fileExtension = file.originalname.split('.').pop() || 'bin';
      const fileName = `${uuidv4()}.${fileExtension}`;

      // Upload to MinIO
      const mediaUrl = await mediaService.uploadGenericFile(buffer, mimeType, fileName);

      logger.info('Media uploaded successfully', {
        userId,
        userRole,
        mediaUrl,
        mediaType,
        mimeType,
        fileName,
        size: buffer.length,
      });

      res.json({
        success: true,
        mediaUrl,
        mediaType,
        mimeType,
        fileName,
      });
    } catch (error: any) {
      logger.error('Error uploading media', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get pre-signed URL for media access
   */
  private async getMediaUrl(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const userId = (req as any).user?.sub;
      const userRole = (req as any).user?.role;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Get message
      const messageRepo = AppDataSource.getRepository(Message);
      const message = await messageRepo.findOne({
        where: { id: messageId as UUID },
        relations: ['attendance'],
      });

      if (!message) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      // Verify user has access to this message's attendance
      const hasAccess = await this.verifyAttendanceAccess(
        message.attendanceId,
        userId,
        userRole
      );

      if (!hasAccess) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Check if message has media
      const mediaUrl = message.metadata?.mediaUrl;
      if (!mediaUrl) {
        res.status(404).json({ error: 'Message has no media' });
        return;
      }

      // Generate pre-signed URL (valid for 1 hour)
      const url = await mediaService.getMediaUrl(mediaUrl, 3600);

      res.json({
        success: true,
        url,
        mediaType: message.metadata?.mediaType,
        expiresIn: 3600,
      });
    } catch (error: any) {
      logger.error('Error getting media URL', {
        error: error.message,
        stack: error.stack,
        messageId: req.params.messageId,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get media file directly (stream)
   */
  private async getMedia(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const userId = (req as any).user?.sub;
      const userRole = (req as any).user?.role;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Get message
      const messageRepo = AppDataSource.getRepository(Message);
      const message = await messageRepo.findOne({
        where: { id: messageId as UUID },
        relations: ['attendance'],
      });

      if (!message) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      // Verify user has access to this message's attendance
      const hasAccess = await this.verifyAttendanceAccess(
        message.attendanceId,
        userId,
        userRole
      );

      if (!hasAccess) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Check if message has media
      const mediaUrl = message.metadata?.mediaUrl;
      if (!mediaUrl) {
        res.status(404).json({ error: 'Message has no media' });
        return;
      }

      // Get media file from MinIO
      const buffer = await mediaService.getMediaFile(mediaUrl);

      // Determine content type from file extension or mediaType
      const mediaType = message.metadata?.mediaType || 'application/octet-stream';
      
      // Try to get MIME type - prioritize metadata mediaType for webm files
      let contentType = 'application/octet-stream';
      const fileExtension = mediaUrl.split('.').pop()?.toLowerCase();
      
      // If we have mediaType in metadata, use it to determine MIME type (important for webm)
      if (mediaType === 'audio') {
        const audioMimeTypes: Record<string, string> = {
          ogg: 'audio/ogg',
          mp3: 'audio/mpeg',
          m4a: 'audio/mp4',
          wav: 'audio/wav',
          webm: 'audio/webm', // Audio webm from MediaRecorder
        };
        contentType = (fileExtension && audioMimeTypes[fileExtension]) || 'audio/webm';
      } else if (mediaType === 'video') {
        const videoMimeTypes: Record<string, string> = {
          mp4: 'video/mp4',
          mpeg: 'video/mpeg',
          webm: 'video/webm',
        };
        contentType = (fileExtension && videoMimeTypes[fileExtension]) || 'video/webm';
      } else if (mediaType === 'image') {
        const imageMimeTypes: Record<string, string> = {
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          gif: 'image/gif',
          webp: 'image/webp',
        };
        contentType = (fileExtension && imageMimeTypes[fileExtension]) || 'image/jpeg';
      } else if (mediaType === 'document') {
        const documentMimeTypes: Record<string, string> = {
          pdf: 'application/pdf',
          doc: 'application/msword',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xls: 'application/vnd.ms-excel',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
        contentType = (fileExtension && documentMimeTypes[fileExtension]) || 'application/pdf';
      } else {
        // Fallback: try to determine from file extension
        const extensionMimeTypes: Record<string, string> = {
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          gif: 'image/gif',
          webp: 'image/webp',
          mp4: 'video/mp4',
          mpeg: 'video/mpeg',
          webm: 'video/webm',
          ogg: 'audio/ogg',
          mp3: 'audio/mpeg',
          m4a: 'audio/mp4',
          wav: 'audio/wav',
          pdf: 'application/pdf',
          doc: 'application/msword',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };
        if (fileExtension && extensionMimeTypes[fileExtension]) {
          contentType = extensionMimeTypes[fileExtension];
        }
      }

      // Set headers and send file (inline para exibição; attachment só em /download)
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Content-Disposition', 'inline');
      res.send(buffer);
    } catch (error: any) {
      logger.error('Error getting media', {
        error: error.message,
        stack: error.stack,
        messageId: req.params.messageId,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Download media file
   */
  private async downloadMedia(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const userId = (req as any).user?.sub;
      const userRole = (req as any).user?.role;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Get message
      const messageRepo = AppDataSource.getRepository(Message);
      const message = await messageRepo.findOne({
        where: { id: messageId as UUID },
        relations: ['attendance'],
      });

      if (!message) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      // Verify user has access to this message's attendance
      const hasAccess = await this.verifyAttendanceAccess(
        message.attendanceId,
        userId,
        userRole
      );

      if (!hasAccess) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Check if message has media
      const mediaUrl = message.metadata?.mediaUrl;
      if (!mediaUrl) {
        res.status(404).json({ error: 'Message has no media' });
        return;
      }

      // Get media file from MinIO
      const buffer = await mediaService.getMediaFile(mediaUrl);

      // Determine file name and content type
      const mediaType = message.metadata?.mediaType || 'file';
      const extensions: Record<string, string> = {
        image: 'jpg',
        video: 'mp4',
        audio: 'ogg',
        document: 'bin',
      };
      const extension = extensions[mediaType] || 'bin';
      const fileName = `media-${messageId}.${extension}`;

      // Set headers for download
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (error: any) {
      logger.error('Error downloading media', {
        error: error.message,
        stack: error.stack,
        messageId: req.params.messageId,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Verify if user has access to an attendance
   * Uses the same logic as AttendanceController
   */
  private async verifyAttendanceAccess(
    attendanceId: UUID,
    userId: UUID,
    userRole: UserRole
  ): Promise<boolean> {
    try {
      // Super admin and admin have access to everything
      if (userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN_GENERAL) {
        return true;
      }

      const attendanceRepo = AppDataSource.getRepository(Attendance);
      const attendance = await attendanceRepo.findOne({
        where: { id: attendanceId },
        relations: ['seller'],
      });

      if (!attendance) {
        logger.warn('Attendance not found for access verification', {
          attendanceId,
          userId,
          userRole,
        });
        return false;
      }

      logger.debug('Attendance found for access verification', {
        attendanceId,
        sellerId: attendance.sellerId,
        supervisorId: attendance.supervisorId,
        userId,
        userRole,
      });

      // Supervisor can access if:
      // 1. Attendance is unassigned (sellerId is null), OR
      // 2. Attendance's seller belongs to this supervisor
      if (userRole === UserRole.SUPERVISOR) {
        if (!attendance.sellerId) {
          logger.debug('Supervisor access granted: unassigned attendance', {
            attendanceId,
            userId,
          });
          return true; // Unassigned attendances are accessible to supervisors
        }
        
        const sellerRepo = AppDataSource.getRepository(Seller);
        const seller = await sellerRepo.findOne({
          where: { id: attendance.sellerId },
          relations: ['supervisors'],
        });
        const canAccess =
          attendance.supervisorId === userId || seller?.supervisors?.some((s) => s.id === userId);
        logger.debug('Supervisor access check result', {
          attendanceId,
          sellerId: attendance.sellerId,
          userId,
          canAccess,
        });
        return !!canAccess;
      }

      // Seller can only access if attendance is assigned to them
      if (userRole === UserRole.SELLER) {
        return attendance.sellerId === userId;
      }

      return false;
    } catch (error: any) {
      logger.error('Error verifying attendance access', {
        error: error.message,
        attendanceId,
        userId,
        userRole,
      });
      return false;
    }
  }
}
