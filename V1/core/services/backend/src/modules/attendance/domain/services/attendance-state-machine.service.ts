import { OperationalState } from '../../../../shared/types/common.types';
import { Attendance } from '../entities/attendance.entity';
import { logger } from '../../../../shared/utils/logger';

export type StateTransition = {
  from: OperationalState;
  to: OperationalState;
  condition?: (attendance: Attendance) => boolean;
};

export class AttendanceStateMachineService {
  private static readonly VALID_TRANSITIONS: StateTransition[] = [
    // TRIAGEM → ABERTO (quando IA classifica intenção e decide atribuir)
    {
      from: OperationalState.TRIAGEM,
      to: OperationalState.ABERTO,
      condition: (attendance) => attendance.isAttributed === true,
    },
    // TRIAGEM → FECHADO_OPERACIONAL (quando NÃO_ATRIBUÍDO e IA respondeu)
    {
      from: OperationalState.TRIAGEM,
      to: OperationalState.FECHADO_OPERACIONAL,
      condition: (attendance) => attendance.isAttributed === false,
    },
    // ABERTO → EM_ATENDIMENTO (quando vendedor assume ou IA inicia fluxo)
    {
      from: OperationalState.ABERTO,
      to: OperationalState.EM_ATENDIMENTO,
    },
    // EM_ATENDIMENTO → AGUARDANDO_CLIENTE (quando aguarda resposta do cliente)
    {
      from: OperationalState.EM_ATENDIMENTO,
      to: OperationalState.AGUARDANDO_CLIENTE,
    },
    // EM_ATENDIMENTO → AGUARDANDO_VENDEDOR (quando aguarda ação do vendedor)
    {
      from: OperationalState.EM_ATENDIMENTO,
      to: OperationalState.AGUARDANDO_VENDEDOR,
    },
    // AGUARDANDO_CLIENTE → EM_ATENDIMENTO (quando cliente responde)
    {
      from: OperationalState.AGUARDANDO_CLIENTE,
      to: OperationalState.EM_ATENDIMENTO,
    },
    // AGUARDANDO_VENDEDOR → EM_ATENDIMENTO (quando vendedor responde)
    {
      from: OperationalState.AGUARDANDO_VENDEDOR,
      to: OperationalState.EM_ATENDIMENTO,
    },
    // EM_ATENDIMENTO → FECHADO_OPERACIONAL (quando atendimento concluído)
    {
      from: OperationalState.EM_ATENDIMENTO,
      to: OperationalState.FECHADO_OPERACIONAL,
    },
    // AGUARDANDO_CLIENTE → FECHADO_OPERACIONAL (após 2h de inatividade - automático)
    {
      from: OperationalState.AGUARDANDO_CLIENTE,
      to: OperationalState.FECHADO_OPERACIONAL,
    },
  ];

  /**
   * Check if a state transition is valid
   */
  canTransition(
    from: OperationalState,
    to: OperationalState,
    attendance?: Attendance
  ): boolean {
    const transition = AttendanceStateMachineService.VALID_TRANSITIONS.find(
      (t: StateTransition) => t.from === from && t.to === to
    );

    if (!transition) {
      logger.warn('Invalid state transition', {
        from,
        to,
        attendanceId: attendance?.id,
      });
      return false;
    }

    // Check condition if exists
    if (transition.condition && attendance) {
      const conditionMet = transition.condition(attendance);
      if (!conditionMet) {
        logger.warn('State transition condition not met', {
          from,
          to,
          attendanceId: attendance.id,
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Get all valid next states from current state
   */
  getValidNextStates(
    currentState: OperationalState,
    attendance?: Attendance
  ): OperationalState[] {
    return AttendanceStateMachineService.VALID_TRANSITIONS
      .filter((t: StateTransition) => t.from === currentState)
      .filter((t: StateTransition) => !t.condition || (attendance && t.condition(attendance)))
      .map((t: StateTransition) => t.to);
  }

  /**
   * Validate and log state transition
   */
  validateTransition(
    from: OperationalState,
    to: OperationalState,
    attendance?: Attendance
  ): { valid: boolean; reason?: string } {
    if (from === to) {
      return { valid: true }; // Same state is always valid
    }

    if (!this.canTransition(from, to, attendance)) {
      return {
        valid: false,
        reason: `Invalid transition from ${from} to ${to}`,
      };
    }

    logger.info('State transition validated', {
      from,
      to,
      attendanceId: attendance?.id,
    });

    return { valid: true };
  }
}
