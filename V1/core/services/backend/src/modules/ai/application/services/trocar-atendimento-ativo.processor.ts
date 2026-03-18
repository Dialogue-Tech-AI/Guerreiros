import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { Attendance } from '../../../attendance/domain/entities/attendance.entity';
import { AttendanceSwitchService } from '../../../attendance/application/services/attendance-switch.service';
import { logger } from '../../../../shared/utils/logger';
import type { FunctionCallProcessorHandler } from '../../domain/interfaces/function-call-processor.interface';

const FC_NAME = 'trocaratendimentoativo';

function parseResult(resultRaw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(resultRaw || '{}');
    return typeof parsed === 'object' && parsed !== null ? parsed : { raw: resultRaw };
  } catch {
    return { raw: resultRaw };
  }
}

/**
 * Processador para trocaratendimentoativo.
 * Troca o atendimento ativo: atual → AGUARDANDO_CLIENTE, novo → EM_ATENDIMENTO.
 */
export function createTrocarAtendimentoAtivoProcessor(): FunctionCallProcessorHandler {
  const attendanceRepo = AppDataSource.getRepository(Attendance);
  const switchService = new AttendanceSwitchService();

  return async (payload): Promise<{ output: string | null; data?: Record<string, unknown>; processed: boolean }> => {
    const { result, attendance_id, client_phone } = payload;
    const parsed = parseResult(result) as Record<string, unknown>;
    const newAttendanceId = (parsed.attendanceId ?? parsed.attendance_id ?? parsed.newAttendanceId) as string | undefined;

    if (!newAttendanceId || typeof newAttendanceId !== 'string') {
      logger.warn(`${FC_NAME}: attendanceId ausente no result`, { result });
      return {
        output: null,
        data: { ...parsed, client_phone, error: 'attendanceId ausente' },
        processed: true,
      };
    }

    try {
      const current = await attendanceRepo.findOne({
        where: { id: attendance_id },
      });
      if (!current?.whatsappNumberId) {
        logger.error(`${FC_NAME}: attendance atual não encontrado`, { attendance_id });
        return {
          output: null,
          data: { ...parsed, client_phone, error: 'Atendimento atual não encontrado' },
          processed: true,
        };
      }

      const out = await switchService.switchActive(
        client_phone,
        current.whatsappNumberId as string,
        attendance_id,
        newAttendanceId
      );

      if (!out.ok) {
        logger.warn(`${FC_NAME}: switch falhou`, { error: out.error });
        return {
          output: null,
          data: { ...parsed, client_phone, error: out.error },
          processed: true,
        };
      }

      logger.info(`${FC_NAME}: troca aplicada`, {
        currentAttendanceId: attendance_id,
        newAttendanceId,
        client_phone,
      });

      return {
        output: null,
        data: { ...parsed, client_phone, switched: true, newAttendanceId },
        processed: true,
      };
    } catch (err: any) {
      logger.error(`${FC_NAME}: erro`, { error: err?.message, attendance_id, client_phone });
      return {
        output: null,
        data: { ...parsed, client_phone, error: err?.message },
        processed: true,
      };
    }
  };
}
