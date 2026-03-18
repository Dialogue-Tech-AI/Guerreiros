import { Router, Request, Response } from 'express';
import { FunctionCallInputService } from '../../application/services/function-call-input.service';
import { logger } from '../../../../shared/utils/logger';

export class FunctionCallInputController {
  public router: Router;
  private inputService: FunctionCallInputService;

  constructor() {
    this.router = Router();
    this.inputService = new FunctionCallInputService();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get('/', this.getAllInputs.bind(this));
    this.router.get('/function-call/:functionCallName', this.getInputsByFunctionCall.bind(this));
    this.router.get('/:id', this.getInputById.bind(this));
    this.router.post('/', this.createInput.bind(this));
    this.router.put('/:id', this.updateInput.bind(this));
    this.router.delete('/:id', this.deleteInput.bind(this));
    this.router.patch('/:id/toggle-active', this.toggleActive.bind(this));
  }

  private async getAllInputs(req: Request, res: Response): Promise<void> {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const inputs = await this.inputService.getAll(includeInactive);

      res.status(200).json({
        success: true,
        data: inputs,
      });
    } catch (error: any) {
      logger.error('Error getting all inputs', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao buscar inputs',
      });
    }
  }

  private async getInputsByFunctionCall(req: Request, res: Response): Promise<void> {
    try {
      const { functionCallName } = req.params;
      const includeInactive = req.query.includeInactive === 'true';

      const inputs = await this.inputService.getByFunctionCallName(
        functionCallName,
        includeInactive
      );

      res.status(200).json({
        success: true,
        data: inputs,
      });
    } catch (error: any) {
      logger.error('Error getting inputs by function call', {
        error: error.message,
        functionCallName: req.params.functionCallName,
      });
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao buscar inputs da function call',
      });
    }
  }

  private async getInputById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const input = await this.inputService.getById(id);

      if (!input) {
        res.status(404).json({
          success: false,
          error: 'Input não encontrado',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: input,
      });
    } catch (error: any) {
      logger.error('Error getting input by ID', {
        error: error.message,
        id: req.params.id,
      });
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao buscar input',
      });
    }
  }

  private async createInput(req: Request, res: Response): Promise<void> {
    try {
      const {
        functionCallName,
        inputFormat,
        template,
        conditions,
        priority,
        description,
        metadata,
        isActive,
      } = req.body;

      if (!functionCallName || !inputFormat || !template) {
        res.status(400).json({
          success: false,
          error: 'functionCallName, inputFormat e template são obrigatórios',
        });
        return;
      }

      const input = await this.inputService.create({
        functionCallName,
        inputFormat,
        template,
        conditions,
        priority,
        description,
        metadata,
        isActive,
      });

      res.status(201).json({
        success: true,
        data: input,
        message: 'Input criado com sucesso',
      });
    } catch (error: any) {
      logger.error('Error creating input', { error: error.message, body: req.body });
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao criar input',
      });
    }
  }

  private async updateInput(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const {
        inputFormat,
        template,
        conditions,
        priority,
        description,
        metadata,
        isActive,
      } = req.body;

      const input = await this.inputService.update(id, {
        inputFormat,
        template,
        conditions,
        priority,
        description,
        metadata,
        isActive,
      });

      res.status(200).json({
        success: true,
        data: input,
        message: 'Input atualizado com sucesso',
      });
    } catch (error: any) {
      logger.error('Error updating input', {
        error: error.message,
        id: req.params.id,
        body: req.body,
      });

      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao atualizar input',
      });
    }
  }

  private async deleteInput(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await this.inputService.delete(id);

      res.status(200).json({
        success: true,
        message: 'Input deletado com sucesso',
      });
    } catch (error: any) {
      logger.error('Error deleting input', {
        error: error.message,
        id: req.params.id,
      });

      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao deletar input',
      });
    }
  }

  private async toggleActive(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const input = await this.inputService.toggleActive(id);

      res.status(200).json({
        success: true,
        data: input,
        message: `Input ${input.isActive ? 'ativado' : 'desativado'} com sucesso`,
      });
    } catch (error: any) {
      logger.error('Error toggling input active status', {
        error: error.message,
        id: req.params.id,
      });

      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao alterar status do input',
      });
    }
  }
}
