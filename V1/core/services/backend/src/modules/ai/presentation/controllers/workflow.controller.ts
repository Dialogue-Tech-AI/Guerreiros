import { Router, Request, Response } from 'express';
import { workflowService } from '../../application/services/workflow.service';
import { logger } from '../../../../shared/utils/logger';

export class WorkflowController {
  public router: Router;

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get('/', this.listWorkflows.bind(this));
    this.router.post('/', this.createWorkflow.bind(this));
    this.router.post('/validate', this.validateDefinition.bind(this));
    this.router.get('/function-handlers', this.getFunctionHandlers.bind(this));
    this.router.get('/:id', this.getWorkflowById.bind(this));
    this.router.put('/:id', this.updateWorkflow.bind(this));
    this.router.delete('/:id', this.deleteWorkflow.bind(this));
  }

  private async listWorkflows(req: Request, res: Response): Promise<void> {
    try {
      const workflows = await workflowService.list();
      res.json({ success: true, data: workflows });
    } catch (error: any) {
      logger.error('Error listing workflows', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao listar workflows' });
    }
  }

  private async getWorkflowById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const workflow = await workflowService.getById(id);
      if (!workflow) {
        res.status(404).json({ success: false, error: 'Workflow não encontrado' });
        return;
      }
      res.json({ success: true, data: workflow });
    } catch (error: any) {
      logger.error('Error fetching workflow', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao buscar workflow' });
    }
  }

  private async createWorkflow(req: Request, res: Response): Promise<void> {
    try {
      const result = await workflowService.create(req.body);
      res.status(201).json({ success: true, data: result.workflow, validation: result.validation });
    } catch (error: any) {
      logger.error('Error creating workflow', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao criar workflow' });
    }
  }

  private async updateWorkflow(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const result = await workflowService.update(id, req.body);
      res.json({ success: true, data: result.workflow, validation: result.validation });
    } catch (error: any) {
      if (error.message === 'Workflow não encontrado') {
        res.status(404).json({ success: false, error: error.message });
        return;
      }
      logger.error('Error updating workflow', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao atualizar workflow' });
    }
  }

  private async deleteWorkflow(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await workflowService.delete(id);
      res.json({ success: true });
    } catch (error: any) {
      if (error.message === 'Workflow não encontrado') {
        res.status(404).json({ success: false, error: error.message });
        return;
      }
      logger.error('Error deleting workflow', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao remover workflow' });
    }
  }

  private async validateDefinition(req: Request, res: Response): Promise<void> {
    try {
      const { definition, entryNodeId } = req.body;
      const result = await workflowService.validateDefinition(definition, entryNodeId);
      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error('Error validating workflow definition', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao validar workflow' });
    }
  }

  private async getFunctionHandlers(req: Request, res: Response): Promise<void> {
    try {
      const handlers = workflowService.getFunctionHandlers();
      res.json({ success: true, data: handlers });
    } catch (error: any) {
      logger.error('Error fetching workflow function handlers', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao buscar handlers de função' });
    }
  }
}
