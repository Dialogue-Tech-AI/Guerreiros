import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { QuoteRequest, type QuoteQuestionAnswer } from '../../../quote/domain/entities/quote-request.entity';
import { logger } from '../../../../shared/utils/logger';
import { socketService } from '../../../../shared/infrastructure/socket/socket.service';
import type { FunctionCallProcessorHandler } from '../../domain/interfaces/function-call-processor.interface';

const FC_NAME = 'respostaperguntaorcamento';

function parseResult(resultRaw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(resultRaw || '{}');
    return typeof parsed === 'object' && parsed !== null ? parsed : { raw: resultRaw };
  } catch {
    return { raw: resultRaw };
  }
}

/**
 * Processador para respostaperguntaorcamento.
 * Associa a resposta do cliente ao card de orçamento (último daquele attendance) e atualiza question_answers.
 */
export function createRespostaPerguntaOrcamentoProcessor(): FunctionCallProcessorHandler {
  const quoteRepo = AppDataSource.getRepository(QuoteRequest);

  return async (payload): Promise<{ output: string | null; data?: Record<string, unknown>; processed: boolean }> => {
    const { result, attendance_id, client_phone } = payload;
    const parsed = parseResult(result) as Record<string, unknown>;
    const data = (parsed?.data as Record<string, unknown>) ?? parsed;

    const answer = (data.resposta ?? data.answer ?? data.resposta_cliente ?? data.content ?? parsed.raw) as string | undefined;
    const question = (data.pergunta ?? data.question ?? data.pergunta_vendedor) as string | undefined;

    try {
      const latest = await quoteRepo.find({
        where: { attendanceId: attendance_id },
        order: { createdAt: 'DESC' },
        take: 1,
      });
      const quote = latest[0];
      if (!quote) {
        logger.warn(`${FC_NAME}: nenhum card de orçamento para attendance`, { attendance_id });
        return { output: null, data: { ...(data as Record<string, unknown>), client_phone }, processed: true };
      }

      const qa: QuoteQuestionAnswer = {
        question: typeof question === 'string' ? question : 'Pergunta do vendedor',
        answer: typeof answer === 'string' ? answer : String(data ?? ''),
        at: new Date().toISOString(),
      };
      const existing = (quote.questionAnswers ?? []) as QuoteQuestionAnswer[];
      const updated = [...existing, qa];

      await quoteRepo.update(
        { id: quote.id },
        { questionAnswers: updated } as any
      );

      logger.info(`${FC_NAME}: resposta associada ao card`, {
        quote_id: quote.id,
        attendance_id,
        client_phone,
      });

      try {
        socketService.emitToRoom('supervisors', 'quote:updated', {
          quoteId: quote.id,
          attendanceId: attendance_id,
          questionAnswers: updated,
        });
        if (quote.sellerId) {
          socketService.emitToRoom(`seller_${quote.sellerId}`, 'quote:updated', {
            quoteId: quote.id,
            attendanceId: attendance_id,
            questionAnswers: updated,
          });
        }
        socketService.emit('quote:updated', { quoteId: quote.id, attendanceId: attendance_id });
      } catch (e: any) {
        logger.error(`${FC_NAME}: erro ao emitir quote:updated`, { error: e?.message });
      }
    } catch (err: any) {
      logger.error(`${FC_NAME}: erro ao atualizar quote`, {
        error: err?.message,
        attendance_id,
        client_phone,
      });
      return { output: null, data: { ...(data as Record<string, unknown>), client_phone, error: err?.message }, processed: true };
    }

    return {
      output: null,
      data: { ...(data as Record<string, unknown>), client_phone },
      processed: true,
    };
  };
}
