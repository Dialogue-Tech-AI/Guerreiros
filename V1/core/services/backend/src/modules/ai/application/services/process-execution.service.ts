import { ProcessService } from './process.service';
import { logger } from '../../../../shared/utils/logger';

/**
 * Executa um processo vinculado a uma function call.
 * Os obrigatórios do processo são preenchidos com o payload da FC (X).
 * Pode ser estendido para publicar em fila ou chamar workflow.
 */
export class ProcessExecutionService {
  constructor(private processService: ProcessService = new ProcessService()) {}

  /**
   * Executa o processo com o payload da function call (attendance_id, client_phone, result/data).
   * Os requiredInputs do processo são preenchidos a partir desse payload.
   */
  async executeProcess(
    processId: string,
    payload: {
      attendance_id?: string;
      client_phone?: string;
      result?: string;
      data?: Record<string, unknown>;
      [key: string]: unknown;
    }
  ): Promise<void> {
    try {
      const process = await this.processService.getById(processId);
      if (!process) {
        logger.warn('Process not found for execution', { processId });
        return;
      }

      const requiredInputs = process.requiredInputs ?? [];
      const filled: Record<string, unknown> = {};
      for (const key of requiredInputs) {
        if (payload[key] !== undefined) filled[key] = payload[key];
      }

      logger.info('Process execution triggered', {
        processId,
        processName: process.name,
        requiredInputs,
        filledKeys: Object.keys(filled),
      });

      // Ponto de extensão: publicar em fila process_execution, chamar workflow, etc.
      // await this.publishToProcessQueue(processId, { ...payload, ...filled });
    } catch (error: any) {
      logger.error('Error executing process', { processId, error: error?.message });
    }
  }
}
