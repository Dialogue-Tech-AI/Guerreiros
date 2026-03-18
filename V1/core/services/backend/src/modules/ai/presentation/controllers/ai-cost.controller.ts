import { Router, Request, Response } from 'express';
import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { AiResponseCost } from '../../domain/entities/ai-response-cost.entity';
import { logger } from '../../../../shared/utils/logger';
import { UserRole } from '../../../../shared/types/common.types';

export class AiCostController {
  public router: Router;

  constructor() {
    this.router = Router();
    this.router.get('/', this.list.bind(this));
    this.router.get('/:id', this.getById.bind(this));
    this.router.delete('/', this.reset.bind(this));
  }

  /**
   * GET /api/ai-costs
   * Lista custos de respostas da IA. Apenas SUPER_ADMIN.
   * Query: limit, offset, dateFrom (ISO), dateTo (ISO)
   */
  private async list(req: Request, res: Response): Promise<void> {
    try {
      const userRole = (req as any).user?.role as UserRole;
      if (userRole !== UserRole.SUPER_ADMIN) {
        res.status(403).json({ error: 'Apenas Super Admin pode acessar custos da IA' });
        return;
      }

      const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
      const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;

      const repo = AppDataSource.getRepository(AiResponseCost);
      const qb = repo
        .createQueryBuilder('c')
        .orderBy('c.created_at', 'DESC')
        .take(limit)
        .skip(offset);

      if (dateFrom) {
        qb.andWhere('c.created_at >= :dateFrom', { dateFrom });
      }
      if (dateTo) {
        qb.andWhere('c.created_at <= :dateTo', { dateTo });
      }

      const [items, total] = await qb.getManyAndCount();

      const rows = items.map((c) => ({
        id: c.id,
        attendanceId: c.attendanceId,
        messageId: c.messageId,
        clientPhone: c.clientPhone,
        scenario: c.scenario,
        model: c.model,
        promptTokens: c.promptTokens,
        completionTokens: c.completionTokens,
        totalTokens: c.totalTokens,
        whisperMinutes: c.whisperMinutes != null ? Number(c.whisperMinutes) : null,
        usdCost: Number(c.usdCost),
        brlCost: Number(c.brlCost),
        routerModel: c.routerModel ?? null,
        routerPromptTokens: c.routerPromptTokens ?? 0,
        routerCompletionTokens: c.routerCompletionTokens ?? 0,
        routerTotalTokens: c.routerTotalTokens ?? 0,
        routerUsdCost: c.routerUsdCost != null ? Number(c.routerUsdCost) : 0,
        routerBrlCost: c.routerBrlCost != null ? Number(c.routerBrlCost) : 0,
        specialistName: c.specialistName ?? null,
        specialistModel: c.specialistModel ?? null,
        specialistPromptTokens: c.specialistPromptTokens ?? 0,
        specialistCompletionTokens: c.specialistCompletionTokens ?? 0,
        specialistTotalTokens: c.specialistTotalTokens ?? 0,
        specialistUsdCost: c.specialistUsdCost != null ? Number(c.specialistUsdCost) : 0,
        specialistBrlCost: c.specialistBrlCost != null ? Number(c.specialistBrlCost) : 0,
        createdAt: c.createdAt.toISOString(),
      }));

      const sumUsd = items.reduce((a, c) => a + Number(c.usdCost), 0);
      const sumBrl = items.reduce((a, c) => a + Number(c.brlCost), 0);
      const sumTokens = items.reduce((a, c) => a + (c.totalTokens || 0), 0);

      res.json({
        success: true,
        data: { rows, total },
        aggregates: {
          sumUsd: Math.round(sumUsd * 1e6) / 1e6,
          sumBrl: Math.round(sumBrl * 1e6) / 1e6,
          sumTokens,
        },
      });
    } catch (e: any) {
      logger.error('AI costs list error', { error: e?.message });
      res.status(500).json({ error: e?.message ?? 'Erro ao listar custos' });
    }
  }

  /**
   * GET /api/ai-costs/:id
   * Retorna um registro de custo por ID, incluindo execution_log (log da execução).
   * Apenas SUPER_ADMIN.
   */
  private async getById(req: Request, res: Response): Promise<void> {
    try {
      const userRole = (req as any).user?.role as UserRole;
      if (userRole !== UserRole.SUPER_ADMIN) {
        res.status(403).json({ error: 'Apenas Super Admin pode acessar custos da IA' });
        return;
      }

      const id = req.params.id as string;
      if (!id) {
        res.status(400).json({ error: 'ID é obrigatório' });
        return;
      }

      const repo = AppDataSource.getRepository(AiResponseCost);
      const c = await repo.findOne({ where: { id } as any });
      if (!c) {
        res.status(404).json({ error: 'Registro de custo não encontrado' });
        return;
      }

      const row = {
        id: c.id,
        attendanceId: c.attendanceId,
        messageId: c.messageId,
        clientPhone: c.clientPhone,
        scenario: c.scenario,
        model: c.model,
        promptTokens: c.promptTokens,
        completionTokens: c.completionTokens,
        totalTokens: c.totalTokens,
        whisperMinutes: c.whisperMinutes != null ? Number(c.whisperMinutes) : null,
        usdCost: Number(c.usdCost),
        brlCost: Number(c.brlCost),
        routerModel: c.routerModel ?? null,
        routerPromptTokens: c.routerPromptTokens ?? 0,
        routerCompletionTokens: c.routerCompletionTokens ?? 0,
        routerTotalTokens: c.routerTotalTokens ?? 0,
        routerUsdCost: c.routerUsdCost != null ? Number(c.routerUsdCost) : 0,
        routerBrlCost: c.routerBrlCost != null ? Number(c.routerBrlCost) : 0,
        specialistName: c.specialistName ?? null,
        specialistModel: c.specialistModel ?? null,
        specialistPromptTokens: c.specialistPromptTokens ?? 0,
        specialistCompletionTokens: c.specialistCompletionTokens ?? 0,
        specialistTotalTokens: c.specialistTotalTokens ?? 0,
        specialistUsdCost: c.specialistUsdCost != null ? Number(c.specialistUsdCost) : 0,
        specialistBrlCost: c.specialistBrlCost != null ? Number(c.specialistBrlCost) : 0,
        executionLog: c.executionLog ?? null,
        createdAt: c.createdAt.toISOString(),
      };

      res.json({ success: true, data: row });
    } catch (e: any) {
      logger.error('AI costs getById error', { error: e?.message });
      res.status(500).json({ error: e?.message ?? 'Erro ao buscar custo' });
    }
  }

  /**
   * DELETE /api/ai-costs
   * Remove todos os registros de custo. Apenas SUPER_ADMIN.
   */
  private async reset(req: Request, res: Response): Promise<void> {
    try {
      const userRole = (req as any).user?.role as UserRole;
      if (userRole !== UserRole.SUPER_ADMIN) {
        res.status(403).json({ error: 'Apenas Super Admin pode resetar custos da IA' });
        return;
      }

      const repo = AppDataSource.getRepository(AiResponseCost);
      const result = await repo.createQueryBuilder().delete().from(AiResponseCost).execute();
      const deleted = result.affected ?? 0;

      logger.info('AI costs reset', { deleted, userId: (req as any).user?.sub });

      res.json({ success: true, deleted });
    } catch (e: any) {
      logger.error('AI costs reset error', { error: e?.message });
      res.status(500).json({ error: e?.message ?? 'Erro ao resetar custos' });
    }
  }
}
