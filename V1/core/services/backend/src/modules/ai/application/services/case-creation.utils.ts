/**
 * Utilitários para criação de casos (attendance_cases).
 * Caso = situação criada por FC que vendedor/supervisor precisam responder; não inclui "Não Atribuídos".
 * Ver docs/CASOS_E_ATENDIMENTOS_MODELO.md
 */
import { In, MoreThan } from 'typeorm';
import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { AttendanceCase } from '../../../attendance/domain/entities/attendance-case.entity';
import { CaseStatus } from '../../../../shared/types/common.types';
import { logger } from '../../../../shared/utils/logger';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const INTERVENTION_BALCAO = 'encaminhados-balcao';
const OPEN_CASE_STATUSES = [CaseStatus.NOVO, CaseStatus.EM_ANDAMENTO, CaseStatus.AGUARDANDO_VENDEDOR, CaseStatus.AGUARDANDO_CLIENTE];

/**
 * Verifica se é permitido criar um novo caso para o atendimento/tipo informados.
 * - Sempre: não criar se já existe caso em andamento (NOVO/EM_ANDAMENTO/etc).
 * - Apenas para encaminhados-balcao: também não criar se existe caso da mesma
 *   categoria criado nas últimas 2 horas.
 *
 * @param attendanceId ID do atendimento
 * @param caseTypeId ID do tipo de caso
 * @param interventionType interventionType do attendance; quando é 'encaminhados-balcao'
 *   aplica-se a regra das 2h; nos demais, só vale a regra de caso em andamento.
 * @returns true se pode criar novo caso, false se já existe um em andamento ou (só em balcão) um recente
 */
export async function canCreateNewCase(
  attendanceId: string,
  caseTypeId: string,
  interventionType?: string | null
): Promise<boolean> {
  try {
    const attendanceCaseRepo = AppDataSource.getRepository(AttendanceCase);

    // Verificar se existe caso em andamento (todos os atendimentos)
    const existingOpen = await attendanceCaseRepo.findOne({
      where: {
        attendanceId,
        caseTypeId,
        status: In(OPEN_CASE_STATUSES),
      },
    });

    if (existingOpen) {
      logger.info('canCreateNewCase: caso em andamento encontrado, não criar duplicado', {
        attendanceId,
        caseTypeId,
        existingCaseId: existingOpen.id,
      });
      return false;
    }

    // Regra das 2h: apenas para atendimentos em encaminhamentos balcão
    if (interventionType === INTERVENTION_BALCAO) {
      const twoHoursAgo = new Date(Date.now() - TWO_HOURS_MS);
      const recentCase = await attendanceCaseRepo.findOne({
        where: {
          attendanceId,
          caseTypeId,
          createdAt: MoreThan(twoHoursAgo),
        },
        order: { createdAt: 'DESC' },
      });

      if (recentCase) {
        logger.info('canCreateNewCase: [balcão] caso recente (< 2h), não criar duplicado', {
          attendanceId,
          caseTypeId,
          recentCaseId: recentCase.id,
          recentCaseCreatedAt: recentCase.createdAt,
        });
        return false;
      }
    }

    return true;
  } catch (error: any) {
    logger.error('canCreateNewCase: erro ao verificar casos existentes', {
      error: error.message,
      attendanceId,
      caseTypeId,
    });
    // Em caso de erro, permitir criação para não bloquear o fluxo
    return true;
  }
}
