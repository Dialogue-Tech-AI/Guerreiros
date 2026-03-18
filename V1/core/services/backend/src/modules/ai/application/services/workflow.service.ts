import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { Workflow } from '../../domain/entities/workflow.entity';
import type { WorkflowDefinition } from '../../domain/entities/workflow.entity';
import { validateWorkflowDefinition, type ValidationResult } from './workflow-validation.service';
import { logger } from '../../../../shared/utils/logger';
import { UUID } from '../../../../shared/types/common.types';

export type WorkflowSaveResult = { workflow: Workflow; validation: ValidationResult };

export interface WorkflowCreateInput {
  name: string;
  description?: string | null;
  entryNodeId?: string | null;
  definition: WorkflowDefinition;
  isActive?: boolean;
}

export interface WorkflowUpdateInput {
  name?: string;
  description?: string | null;
  entryNodeId?: string | null;
  definition?: WorkflowDefinition;
  isActive?: boolean;
}

/** Fixed list of function handlers for phase 1 (plan: catálogo para nós tipo function) */
export const WORKFLOW_FUNCTION_HANDLERS = [
  { name: 'check_attendance_tag', description: 'Verifica se o atendimento possui uma tag', paramsSchema: { tagKey: { type: 'string', required: true } } },
  { name: 'add_tag', description: 'Adiciona uma tag ao atendimento', paramsSchema: { tagKey: { type: 'string', required: true }, tagValue: { type: 'string', required: false } } },
  { name: 'remove_tag', description: 'Remove uma tag do atendimento', paramsSchema: { tagKey: { type: 'string', required: true } } },
];

export class WorkflowService {
  private workflowRepository = AppDataSource.getRepository(Workflow);

  async list(): Promise<Workflow[]> {
    return this.workflowRepository.find({
      order: { updatedAt: 'DESC' },
    });
  }

  async getById(id: UUID): Promise<Workflow | null> {
    return this.workflowRepository.findOne({ where: { id } });
  }

  async create(input: WorkflowCreateInput): Promise<WorkflowSaveResult> {
    const validation = await validateWorkflowDefinition(input.definition, input.entryNodeId ?? null);
    const isActive = validation.valid ? (input.isActive ?? true) : false;
    const workflow = this.workflowRepository.create({
      name: input.name,
      description: input.description ?? null,
      entryNodeId: input.entryNodeId ?? null,
      definition: input.definition ?? { nodes: [], edges: [] },
      isActive,
    });
    const saved = await this.workflowRepository.save(workflow);
    logger.info('Workflow created', { id: saved.id, name: saved.name, valid: validation.valid });
    return { workflow: saved, validation };
  }

  async update(id: UUID, input: WorkflowUpdateInput): Promise<WorkflowSaveResult> {
    const workflow = await this.workflowRepository.findOne({ where: { id } });
    if (!workflow) throw new Error('Workflow não encontrado');
    const definition = input.definition ?? workflow.definition;
    const entryNodeId = input.entryNodeId !== undefined ? input.entryNodeId : workflow.entryNodeId;
    const validation = await validateWorkflowDefinition(definition, entryNodeId ?? null);
    if (input.name !== undefined) workflow.name = input.name;
    if (input.description !== undefined) workflow.description = input.description ?? null;
    if (input.entryNodeId !== undefined) workflow.entryNodeId = input.entryNodeId ?? null;
    if (input.definition !== undefined) workflow.definition = input.definition;
    if (input.isActive !== undefined) {
      workflow.isActive = validation.valid ? input.isActive : false;
    } else if (!validation.valid) {
      workflow.isActive = false;
    }
    const saved = await this.workflowRepository.save(workflow);
    logger.info('Workflow updated', { id: saved.id, valid: validation.valid });
    return { workflow: saved, validation };
  }

  async delete(id: UUID): Promise<void> {
    const workflow = await this.workflowRepository.findOne({ where: { id } });
    if (!workflow) throw new Error('Workflow não encontrado');
    await this.workflowRepository.remove(workflow);
    logger.info('Workflow deleted', { id });
  }

  /** Validate definition without persisting */
  async validateDefinition(definition: WorkflowDefinition, entryNodeId?: string | null) {
    return validateWorkflowDefinition(definition, entryNodeId ?? null);
  }

  /** Return list of function handlers for workflow function nodes */
  getFunctionHandlers(): typeof WORKFLOW_FUNCTION_HANDLERS {
    return WORKFLOW_FUNCTION_HANDLERS;
  }
}

export const workflowService = new WorkflowService();
