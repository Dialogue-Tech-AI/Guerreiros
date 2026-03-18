// @ts-nocheck
import { Router, Request, Response } from 'express';
import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { QuoteRequest } from '../../domain/entities/quote-request.entity';
import { Attendance } from '../../../attendance/domain/entities/attendance.entity';
import { Message } from '../../../message/domain/entities/message.entity';
import { Seller } from '../../../seller/domain/entities/seller.entity';
import { User } from '../../../auth/domain/entities/user.entity';
import { getSellersBySupervisorId } from '../../../seller/application/get-sellers-by-supervisor';
import { UUID, UserRole, MessageOrigin, MessageStatus } from '../../../../shared/types/common.types';
import { logger } from '../../../../shared/utils/logger';
import { messageSenderService } from '../../../message/application/services/message-sender.service';
import { messageBufferService } from '../../../message/application/services/message-buffer.service';
import { mediaService } from '../../../message/application/services/media.service';
import { socketService } from '../../../../shared/infrastructure/socket/socket.service';
import axios from 'axios';
import config from '../../../../config/app.config';

/** Normaliza quebras de linha para \n e preserva no conteúdo (evita exibir orçamento em uma linha só). */
function normalizeLineBreaks(text: string): string {
  return (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

export class QuoteRequestController {
  public router: Router;

  constructor() {
    this.router = Router();
    this.router.get('/', this.list.bind(this));
    this.router.get('/:id', this.getById.bind(this));
    this.router.patch('/:id', this.updateStatus.bind(this));
    this.router.post('/:id/mark-viewed', this.markViewed.bind(this));
    this.router.post('/:id/perguntar', this.perguntar.bind(this));
    this.router.post('/:id/enviar', this.enviarOrcamento.bind(this));
    this.router.delete('/:id', this.deletar.bind(this));
  }

  private async list(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.sub as UUID;
      const userRole = (req as any).user?.role as UserRole;
      const subdivision = (req.query.subdivision as string) || 'pedidos-orcamentos';

      if (!userId || !userRole) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const quoteRepo = AppDataSource.getRepository(QuoteRequest);
      const sellerRepo = AppDataSource.getRepository(Seller);

      let quotes: QuoteRequest[];
      if (userRole === UserRole.SELLER) {
        quotes = await quoteRepo.find({
          where: { sellerSubdivision: subdivision, sellerId: userId },
          order: { createdAt: 'DESC' },
        });
      } else if (userRole === UserRole.SUPERVISOR) {
        const sellers = await getSellersBySupervisorId(sellerRepo, userId as string);
        const sellerIds = sellers.map((s) => s.id);
        const qb = quoteRepo.createQueryBuilder('q').where('q.seller_subdivision = :sub', { sub: subdivision });
        // Pedidos de orçamento: exibir sempre, inclusive os sem vendedor (seller_id nulo)
        if (subdivision === 'pedidos-orcamentos' || subdivision === 'pedidos-orcamentos-enviados') {
          if (sellerIds.length > 0) {
            qb.andWhere('(q.seller_id IN (:...ids) OR q.seller_id IS NULL)', { ids: sellerIds });
          } else {
            qb.andWhere('q.seller_id IS NULL');
          }
        } else if (sellerIds.length === 0) {
          res.json({ success: true, quotes: [] });
          return;
        } else {
          qb.andWhere('q.seller_id IN (:...ids)', { ids: sellerIds });
        }
        quotes = await qb.orderBy('q.created_at', 'DESC').getMany();
      } else if (userRole === UserRole.ADMIN_GENERAL || userRole === UserRole.SUPER_ADMIN) {
        quotes = await quoteRepo.find({
          where: { sellerSubdivision: subdivision },
          order: { createdAt: 'DESC' },
        });
      } else {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // Para pedidos sem nome, buscar pushName da última ou da primeira mensagem do cliente
      const quotesWithoutName = quotes.filter((q) => !q.clientName?.trim());
      const attendanceIdsToResolve = [...new Set(quotesWithoutName.map((q) => q.attendanceId))];
      const messageRepo = AppDataSource.getRepository(Message);
      const nameByAttendance: Record<string, string> = {};
      for (const aid of attendanceIdsToResolve) {
        const lastMsg = await messageRepo.findOne({
          where: { attendanceId: aid, origin: MessageOrigin.CLIENT },
          order: { sentAt: 'DESC' },
          select: ['metadata'],
        });
        let name = lastMsg?.metadata?.pushName && typeof lastMsg.metadata.pushName === 'string'
          ? (lastMsg.metadata.pushName as string).trim()
          : '';
        if (!name) {
          const firstMsg = await messageRepo.findOne({
            where: { attendanceId: aid, origin: MessageOrigin.CLIENT },
            order: { sentAt: 'ASC' },
            select: ['metadata'],
          });
          name = firstMsg?.metadata?.pushName && typeof firstMsg.metadata.pushName === 'string'
            ? (firstMsg.metadata.pushName as string).trim()
            : '';
        }
        if (name) nameByAttendance[aid] = name;
      }

      const list = quotes.map((q) => {
        const displayName = q.clientName?.trim() || nameByAttendance[q.attendanceId] || undefined;
        return {
          id: q.id,
          attendanceId: q.attendanceId,
          sellerId: q.sellerId,
          clientPhone: q.clientPhone,
          clientName: displayName ?? q.clientName,
          items: q.items,
          observations: q.observations,
          status: q.status,
          questionAnswers: q.questionAnswers,
          sellerViewedAt: q.sellerViewedAt?.toISOString() ?? null,
          createdAt: q.createdAt.toISOString(),
          updatedAt: q.updatedAt.toISOString(),
        };
      });
      res.json({ success: true, quotes: list });
    } catch (e: any) {
      logger.error('Quote list error', { error: e?.message });
      res.status(500).json({ error: e?.message ?? 'Internal server error' });
    }
  }

  private async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as UUID;
      const userId = (req as any).user?.sub as UUID;
      const userRole = (req as any).user?.role as UserRole;

      const quoteRepo = AppDataSource.getRepository(QuoteRequest);
      const quote = await quoteRepo.findOne({ where: { id } });
      if (!quote) {
        res.status(404).json({ error: 'Quote not found' });
        return;
      }

      const sellerRepo = AppDataSource.getRepository(Seller);
      if (userRole === UserRole.SELLER && quote.sellerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      if (userRole === UserRole.SUPERVISOR) {
        const sellers = await getSellersBySupervisorId(sellerRepo, userId as string);
        const ok = sellers.some((s) => s.id === quote.sellerId);
        if (!ok && quote.sellerId) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      } else if (userRole !== UserRole.ADMIN_GENERAL && userRole !== UserRole.SUPER_ADMIN) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const messageRepo = AppDataSource.getRepository(Message);
      let displayName = quote.clientName?.trim();
      if (!displayName) {
        const lastMsg = await messageRepo.findOne({
          where: { attendanceId: quote.attendanceId, origin: MessageOrigin.CLIENT },
          order: { sentAt: 'DESC' },
          select: ['metadata'],
        });
        let name = lastMsg?.metadata?.pushName && typeof lastMsg.metadata.pushName === 'string'
          ? (lastMsg.metadata.pushName as string).trim()
          : '';
        if (!name) {
          const firstMsg = await messageRepo.findOne({
            where: { attendanceId: quote.attendanceId, origin: MessageOrigin.CLIENT },
            order: { sentAt: 'ASC' },
            select: ['metadata'],
          });
          name = firstMsg?.metadata?.pushName && typeof firstMsg.metadata.pushName === 'string'
            ? (firstMsg.metadata.pushName as string).trim()
            : '';
        }
        if (name) displayName = name;
      }

      res.json({
        success: true,
        quote: {
          id: quote.id,
          attendanceId: quote.attendanceId,
          sellerId: quote.sellerId,
          clientPhone: quote.clientPhone,
          clientName: displayName ?? quote.clientName,
          items: quote.items,
          observations: quote.observations,
          status: quote.status,
          questionAnswers: quote.questionAnswers,
          sellerViewedAt: quote.sellerViewedAt?.toISOString() ?? null,
          createdAt: quote.createdAt.toISOString(),
          updatedAt: quote.updatedAt.toISOString(),
        },
      });
    } catch (e: any) {
      logger.error('Quote getById error', { error: e?.message });
      res.status(500).json({ error: e?.message ?? 'Internal server error' });
    }
  }

  /**
   * Mark a quote as viewed by a seller. Only sellers can mark as viewed.
   * POST /quote-requests/:id/mark-viewed
   */
  private async markViewed(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as UUID;
      const userId = (req as any).user?.sub as UUID;
      const userRole = (req as any).user?.role as UserRole;

      if (!userId || !userRole) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Apenas vendedores podem marcar como visualizado
      if (userRole !== UserRole.SELLER) {
        res.json({ success: true, message: 'Only sellers mark as viewed' });
        return;
      }

      const quoteRepo = AppDataSource.getRepository(QuoteRequest);
      const quote = await quoteRepo.findOne({ where: { id } });
      if (!quote) {
        res.status(404).json({ error: 'Quote not found' });
        return;
      }

      if (quote.sellerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // Só marcar se ainda não foi visto
      if (!quote.sellerViewedAt) {
        await quoteRepo.update({ id }, { sellerViewedAt: new Date() });
      }

      res.json({ success: true });
    } catch (e: any) {
      logger.error('Quote markViewed error', { error: e?.message });
      res.status(500).json({ error: e?.message ?? 'Internal server error' });
    }
  }

  private async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as UUID;
      const { status } = req.body as { status?: string };
      const userId = (req as any).user?.sub as UUID;
      const userRole = (req as any).user?.role as UserRole;

      const quoteRepo = AppDataSource.getRepository(QuoteRequest);
      const quote = await quoteRepo.findOne({ where: { id } });
      if (!quote) {
        res.status(404).json({ error: 'Quote not found' });
        return;
      }

      const sellerRepo = AppDataSource.getRepository(Seller);
      if (userRole === UserRole.SELLER && quote.sellerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      if (userRole === UserRole.SUPERVISOR) {
        const sellers = await getSellersBySupervisorId(sellerRepo, userId as string);
        const ok = sellers.some((s) => s.id === quote.sellerId);
        if (!ok && quote.sellerId) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      } else if (userRole !== UserRole.ADMIN_GENERAL && userRole !== UserRole.SUPER_ADMIN) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const allowed = ['pendente', 'em_elaboracao', 'enviado'];
      if (!status || !allowed.includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }

      await quoteRepo.update({ id }, { status: status as any });
      res.json({ success: true });
    } catch (e: any) {
      logger.error('Quote updateStatus error', { error: e?.message });
      res.status(500).json({ error: e?.message ?? 'Internal server error' });
    }
  }

  private async perguntar(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as UUID;
      const { content } = req.body as { content?: string };
      const userId = (req as any).user?.sub as UUID;
      const userRole = (req as any).user?.role as UserRole;

      if (!content || typeof content !== 'string' || !content.trim()) {
        res.status(400).json({ error: 'Content is required' });
        return;
      }

      const quoteRepo = AppDataSource.getRepository(QuoteRequest);
      const quote = await quoteRepo.findOne({ where: { id } });
      if (!quote) {
        res.status(404).json({ error: 'Quote not found' });
        return;
      }

      const sellerRepo = AppDataSource.getRepository(Seller);
      if (userRole === UserRole.SELLER && quote.sellerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      if (userRole === UserRole.SUPERVISOR) {
        const sellers = await getSellersBySupervisorId(sellerRepo, userId as string);
        const ok = sellers.some((s) => s.id === quote.sellerId);
        if (!ok && quote.sellerId) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      } else if (userRole !== UserRole.ADMIN_GENERAL && userRole !== UserRole.SUPER_ADMIN) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const attendanceRepo = AppDataSource.getRepository(Attendance);
      const attendance = await attendanceRepo.findOne({ where: { id: quote.attendanceId } });
      if (!attendance) {
        res.status(404).json({ error: 'Attendance not found' });
        return;
      }

      const userRepo = AppDataSource.getRepository(User);
      const senderUser = await userRepo.findOne({ where: { id: userId } });
      const senderName = senderUser?.name ?? 'Vendedor';

      const messageRepo = AppDataSource.getRepository(Message);
      const message = messageRepo.create({
        attendanceId: attendance.id,
        origin: MessageOrigin.SELLER,
        content: content.trim(),
        status: MessageStatus.PENDING,
        metadata: { sentBy: userId, sentByRole: userRole, senderName },
        sentAt: new Date(),
      });
      await messageRepo.save(message);

      messageSenderService
        .sendMessageAsync(message.id, attendance.id, content.trim(), senderName)
        .catch((err) => logger.error('Perguntar send failed', { messageId: message.id, error: err?.message }));

      res.json({ success: true, messageId: message.id });
    } catch (e: any) {
      logger.error('Quote perguntar error', { error: e?.message });
      res.status(500).json({ error: e?.message ?? 'Internal server error' });
    }
  }

  private async enviarOrcamento(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as UUID;
      const { content, mediaUrl, mimeType } = req.body as { 
        content?: string; 
        mediaUrl?: string; 
        mimeType?: string;
      };
      const userId = (req as any).user?.sub as UUID;
      const userRole = (req as any).user?.role as UserRole;

      if (!content?.trim() && !mediaUrl) {
        res.status(400).json({ error: 'Content or mediaUrl is required' });
        return;
      }

      const quoteRepo = AppDataSource.getRepository(QuoteRequest);
      const quote = await quoteRepo.findOne({ where: { id } });
      if (!quote) {
        res.status(404).json({ error: 'Quote not found' });
        return;
      }

      // Verificação de permissões
      if (userRole === UserRole.SELLER) {
        if (quote.sellerId !== userId) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      } else if (userRole === UserRole.SUPERVISOR) {
        const sellerRepo = AppDataSource.getRepository(Seller);
        const sellers = await getSellersBySupervisorId(sellerRepo, userId as string);
        const ok = sellers.some((s) => s.id === quote.sellerId);
        if (!ok && quote.sellerId) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      } else if (userRole !== UserRole.ADMIN_GENERAL && userRole !== UserRole.SUPER_ADMIN) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const attendanceRepo = AppDataSource.getRepository(Attendance);
      const attendance = await attendanceRepo.findOne({ where: { id: quote.attendanceId } });
      if (!attendance) {
        res.status(404).json({ error: 'Attendance not found' });
        return;
      }

      // Atualizar status do pedido para 'enviado' e mudar subdivision
      await quoteRepo.update(
        { id }, 
        { 
          status: 'enviado' as any,
          sellerSubdivision: 'pedidos-orcamentos-enviados'
        }
      );

      // Desligar IA por 10 horas
      const tenHoursFromNow = new Date();
      tenHoursFromNow.setHours(tenHoursFromNow.getHours() + 10);
      await attendanceRepo.update(
        { id: attendance.id },
        { aiDisabledUntil: tenHoursFromNow }
      );

      // Limpar buffer de mensagens do atendimento - evita que flush posterior envie mensagens
      // antigas (ex: "Obrigado") e cause exibição incorreta de "Cliente" no chat
      messageBufferService.clearBufferForAttendance(attendance.id);

      // Criar mensagem do vendedor com o conteúdo do orçamento
      const messageRepo = AppDataSource.getRepository(Message);
      const userRepo = AppDataSource.getRepository(User);
      const senderUser = await userRepo.findOne({ where: { id: userId } });
      const senderName = senderUser?.name ?? 'Vendedor';

      // Se houver mídia, enviar PRIMEIRO (sem caption se houver texto)
      if (mediaUrl && mimeType) {
        try {
          logger.info('Sending quote media', { mediaUrl, mimeType, hasText: !!content?.trim() });
          
          // Buscar a mídia do MinIO
          const mediaBuffer = await mediaService.getMediaFile(mediaUrl);

          // Determinar mediaType do mimeType para metadata
          let mediaType = 'document';
          if (mimeType.startsWith('image/')) {
            mediaType = 'image';
          } else if (mimeType.startsWith('video/')) {
            mediaType = 'video';
          } else if (mimeType.startsWith('audio/')) {
            mediaType = 'audio';
          }

          const mediaMessage = messageRepo.create({
            attendanceId: attendance.id,
            origin: MessageOrigin.SELLER,
            content: '', // Sem caption na imagem
            status: MessageStatus.PENDING,
            metadata: {
              sentBy: userId,
              sentByRole: userRole,
              senderName,
              quoteId: quote.id,
              isQuote: true,
              mediaUrl,
              mediaType,
              mimeType,
            },
            sentAt: new Date(),
          });
          await messageRepo.save(mediaMessage);

          // Enviar mídia sem caption
          await messageSenderService.sendMediaAsync(
            mediaMessage.id,
            attendance.id,
            mediaBuffer,
            mimeType,
            undefined // Sem caption
          );
          
          logger.info('Quote media sent successfully', { mediaUrl, mediaType, mimeType });
        } catch (mediaError: any) {
          logger.error('Error sending quote media', { 
            error: mediaError?.message, 
            stack: mediaError?.stack,
            mediaUrl, 
            mimeType 
          });
        }
      }

      // Enviar conteúdo do orçamento DEPOIS da imagem (se houver)
      if (content?.trim()) {
        const normalizedContent = normalizeLineBreaks(content);
        const quoteMessage = messageRepo.create({
          attendanceId: attendance.id,
          origin: MessageOrigin.SELLER,
          content: normalizedContent,
          status: MessageStatus.PENDING,
          metadata: { 
            sentBy: userId, 
            sentByRole: userRole, 
            senderName,
            quoteId: quote.id,
            isQuote: true
          },
          sentAt: new Date(),
        });
        await messageRepo.save(quoteMessage);

        await messageSenderService.sendMessageAsync(
          quoteMessage.id,
          attendance.id,
          normalizedContent,
          senderName
        );

        // Atualizar chat em tempo real com a mensagem (conteúdo com quebras de linha preservadas)
        const eventData = {
          attendanceId: attendance.id,
          messageId: quoteMessage.id,
          clientPhone: attendance.clientPhone,
          isUnassigned: !attendance.sellerId,
          ...(attendance.sellerId && { sellerId: attendance.sellerId }),
          ...(attendance.sellerId && attendance.sellerSubdivision && { sellerSubdivision: attendance.sellerSubdivision }),
          message: {
            id: quoteMessage.id,
            content: quoteMessage.content,
            origin: quoteMessage.origin,
            status: quoteMessage.status,
            sentAt: quoteMessage.sentAt.toISOString(),
            metadata: {
              ...quoteMessage.metadata,
              sentAt: quoteMessage.sentAt.toISOString(),
              createdAt: quoteMessage.sentAt.toISOString(),
            },
          },
        };
        if (attendance.sellerId) {
          socketService.emitToRoom(`seller_${attendance.sellerId}`, 'message_sent', eventData);
          socketService.emitToRoom(`seller_${attendance.sellerId}`, 'message_received', eventData);
        }
        socketService.emitToRoom('supervisors', 'message_sent', eventData);
        socketService.emitToRoom('supervisors', 'message_received', eventData);
      }

      logger.info('Quote sent successfully', { quoteId: id, attendanceId: attendance.id });
      res.json({ success: true });
    } catch (e: any) {
      logger.error('Quote enviarOrcamento error', { error: e?.message });
      res.status(500).json({ error: e?.message ?? 'Internal server error' });
    }
  }

  private async deletar(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as UUID;
      const userId = (req as any).user?.sub as UUID;
      const userRole = (req as any).user?.role as UserRole;

      const quoteRepo = AppDataSource.getRepository(QuoteRequest);
      const quote = await quoteRepo.findOne({ where: { id } });
      if (!quote) {
        res.status(404).json({ error: 'Quote not found' });
        return;
      }

      const sellerRepo = AppDataSource.getRepository(Seller);
      if (userRole === UserRole.SELLER && quote.sellerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      if (userRole === UserRole.SUPERVISOR) {
        const sellers = await getSellersBySupervisorId(sellerRepo, userId as string);
        const ok = sellers.some((s) => s.id === quote.sellerId);
        if (!ok && quote.sellerId) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      } else if (userRole !== UserRole.SELLER && userRole !== UserRole.SUPERVISOR && userRole !== UserRole.ADMIN_GENERAL && userRole !== UserRole.SUPER_ADMIN) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      await quoteRepo.delete({ id });
      logger.info('Quote deleted successfully', { quoteId: id });
      res.json({ success: true });
    } catch (e: any) {
      logger.error('Quote deletar error', { error: e?.message });
      res.status(500).json({ error: e?.message ?? 'Internal server error' });
    }
  }
}
