import { Router, Request, Response } from 'express';
import { bibliotecaService } from '../../application/services/biblioteca.service';
import { ProcessService } from '../../application/services/process.service';
import { logger } from '../../../../shared/utils/logger';
import { UUID } from '../../../../shared/types/common.types';
import { redisService } from '../../../../shared/infrastructure/redis/redis.service';

export class BibliotecaController {
  public router: Router;
  private processService: ProcessService;

  constructor() {
    this.router = Router();
    this.processService = new ProcessService();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Processos (listar, detalhe, excluir)
    this.router.get('/processes', this.getAllProcesses.bind(this));
    this.router.get('/processes/:id', this.getProcessById.bind(this));
    this.router.delete('/processes/:id', this.deleteProcess.bind(this));

    // Prompts
    this.router.get('/prompts', this.getAllPrompts.bind(this));
    this.router.get('/prompts/:id', this.getPromptById.bind(this));
    this.router.post('/prompts', this.createPrompt.bind(this));
    this.router.put('/prompts/:id', this.updatePrompt.bind(this));
    this.router.delete('/prompts/:id', this.deletePrompt.bind(this));

    // Function Calls
    this.router.get('/function-calls', this.getAllFunctionCalls.bind(this));
    this.router.get('/function-calls/:id', this.getFunctionCallById.bind(this));
    this.router.post('/function-calls', this.createFunctionCall.bind(this));
    this.router.put('/function-calls/:id', this.updateFunctionCall.bind(this));
    this.router.delete('/function-calls/:id', this.deleteFunctionCall.bind(this));

    // Folders (single tree)
    this.router.get('/folders', this.getAllFolders.bind(this));
    this.router.get('/folders/:id', this.getFolderById.bind(this));
    this.router.post('/folders', this.createFolder.bind(this));
    this.router.put('/folders/:id', this.updateFolder.bind(this));
    this.router.delete('/folders/:id', this.deleteFolder.bind(this));

    // Schemas
    this.router.get('/schemas', this.getAllSchemas.bind(this));
    this.router.get('/schemas/:id', this.getSchemaById.bind(this));
    this.router.post('/schemas', this.createSchema.bind(this));
    this.router.put('/schemas/:id', this.updateSchema.bind(this));
    this.router.delete('/schemas/:id', this.deleteSchema.bind(this));

    // Agent Function Calls
    this.router.get('/agent/function-calls', this.getAllAgentFunctionCalls.bind(this));
    this.router.get('/agent/function-calls/:id', this.getAgentFunctionCallById.bind(this));
    this.router.post('/agent/function-calls', this.createAgentFunctionCall.bind(this));
    this.router.put('/agent/function-calls/:id', this.updateAgentFunctionCall.bind(this));
    this.router.delete('/agent/function-calls/:id', this.deleteAgentFunctionCall.bind(this));
    this.router.put('/agent/function-calls', this.saveAllAgentFunctionCalls.bind(this));
  }

  // ========== PROCESSOS (somente leitura) ==========
  private async getAllProcesses(req: Request, res: Response): Promise<void> {
    try {
      const processes = await this.processService.getAll();
      res.json({ success: true, data: processes });
    } catch (error: any) {
      logger.error('Error getting processes', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao buscar processos' });
    }
  }

  private async getProcessById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const process = await this.processService.getById(id);
      if (!process) {
        res.status(404).json({ success: false, error: 'Processo não encontrado' });
        return;
      }
      res.json({ success: true, data: process });
    } catch (error: any) {
      logger.error('Error getting process by id', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao buscar processo' });
    }
  }

  private async deleteProcess(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const deleted = await this.processService.deleteById(id);
      if (!deleted) {
        res.status(404).json({ success: false, error: 'Processo não encontrado' });
        return;
      }
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Error deleting process', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao excluir processo' });
    }
  }

  // ========== PROMPTS ==========
  private async getAllPrompts(req: Request, res: Response): Promise<void> {
    try {
      const prompts = await bibliotecaService.getAllPrompts();
      res.json({ success: true, data: prompts });
    } catch (error: any) {
      logger.error('Error getting all prompts', { 
        error: error.message,
        stack: error.stack,
        name: error.name,
      });
      res.status(500).json({ 
        success: false, 
        error: 'Erro ao buscar prompts',
        details: error.message,
      });
    }
  }

  private async getPromptById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const prompt = await bibliotecaService.getPromptById(id as UUID);
      if (!prompt) {
        res.status(404).json({ success: false, error: 'Prompt não encontrado' });
        return;
      }
      res.json({ success: true, data: prompt });
    } catch (error: any) {
      logger.error('Error getting prompt by id', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao buscar prompt' });
    }
  }

  private async createPrompt(req: Request, res: Response): Promise<void> {
    try {
      const { name, content, folderId } = req.body;
      if (!name || !content) {
        res.status(400).json({ success: false, error: 'Nome e conteúdo são obrigatórios' });
        return;
      }
      const prompt = await bibliotecaService.createPrompt({ name, content, folderId });
      res.json({ success: true, data: prompt });
    } catch (error: any) {
      logger.error('Error creating prompt', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao criar prompt' });
    }
  }

  private async updatePrompt(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, content, folderId } = req.body;
      const prompt = await bibliotecaService.updatePrompt(id as UUID, { name, content, folderId });
      res.json({ success: true, data: prompt });
    } catch (error: any) {
      logger.error('Error updating prompt', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao atualizar prompt' });
    }
  }

  private async deletePrompt(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await bibliotecaService.deletePrompt(id as UUID);
      res.json({ success: true, message: 'Prompt excluído com sucesso' });
    } catch (error: any) {
      logger.error('Error deleting prompt', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao excluir prompt' });
    }
  }

  // ========== FUNCTION CALLS ==========
  private async getAllFunctionCalls(req: Request, res: Response): Promise<void> {
    try {
      const functionCalls = await bibliotecaService.getAllFunctionCalls();
      res.json({ success: true, data: functionCalls });
    } catch (error: any) {
      logger.error('Error getting all function calls', { 
        error: error.message,
        stack: error.stack,
        name: error.name,
      });
      res.status(500).json({ 
        success: false, 
        error: 'Erro ao buscar function calls',
        details: error.message,
      });
    }
  }

  private async getFunctionCallById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const fc = await bibliotecaService.getFunctionCallById(id as UUID);
      if (!fc) {
        res.status(404).json({ success: false, error: 'Function call não encontrada' });
        return;
      }
      res.json({ success: true, data: fc });
    } catch (error: any) {
      logger.error('Error getting function call by id', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao buscar function call' });
    }
  }

  private async createFunctionCall(req: Request, res: Response): Promise<void> {
    try {
      const data = req.body;
      if (!data.name) {
        res.status(400).json({ success: false, error: 'Nome é obrigatório' });
        return;
      }
      const fc = await bibliotecaService.createFunctionCall(data);
      res.json({ success: true, data: fc });
    } catch (error: any) {
      logger.error('Error creating function call', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao criar function call' });
    }
  }

  private async updateFunctionCall(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data = req.body;
      const fc = await bibliotecaService.updateFunctionCall(id as UUID, data);
      res.json({ success: true, data: fc });
    } catch (error: any) {
      logger.error('Error updating function call', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao atualizar function call' });
    }
  }

  private async deleteFunctionCall(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await bibliotecaService.deleteFunctionCall(id as UUID);
      res.json({ success: true, message: 'Function call excluída com sucesso' });
    } catch (error: any) {
      logger.error('Error deleting function call', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao excluir function call' });
    }
  }

  // ========== FOLDERS ==========
  private async getAllFolders(req: Request, res: Response): Promise<void> {
    try {
      const folders = await bibliotecaService.getAllFolders();
      res.json({ success: true, data: folders });
    } catch (error: any) {
      logger.error('Error getting all folders', { 
        error: error.message,
        stack: error.stack,
        name: error.name,
      });
      res.status(500).json({ 
        success: false, 
        error: 'Erro ao buscar pastas',
        details: error.message,
      });
    }
  }

  private async getFolderById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const folder = await bibliotecaService.getFolderById(id as UUID);
      if (!folder) {
        res.status(404).json({ success: false, error: 'Pasta não encontrada' });
        return;
      }
      res.json({ success: true, data: folder });
    } catch (error: any) {
      logger.error('Error getting folder by id', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao buscar pasta' });
    }
  }

  private async createFolder(req: Request, res: Response): Promise<void> {
    try {
      const { name, parentId } = req.body;
      if (!name) {
        res.status(400).json({ success: false, error: 'Nome é obrigatório' });
        return;
      }
      const folder = await bibliotecaService.createFolder({ name, parentId });
      res.json({ success: true, data: folder });
    } catch (error: any) {
      logger.error('Error creating folder', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao criar pasta' });
    }
  }

  private async updateFolder(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, parentId } = req.body;
      const folder = await bibliotecaService.updateFolder(id as UUID, { name, parentId });
      res.json({ success: true, data: folder });
    } catch (error: any) {
      logger.error('Error updating folder', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao atualizar pasta' });
    }
  }

  private async deleteFolder(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await bibliotecaService.deleteFolder(id as UUID);
      res.json({ success: true, message: 'Pasta excluída com sucesso' });
    } catch (error: any) {
      logger.error('Error deleting folder', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao excluir pasta' });
    }
  }

  // ========== SCHEMAS ==========
  private async getAllSchemas(req: Request, res: Response): Promise<void> {
    try {
      const schemas = await bibliotecaService.getAllSchemas();
      res.json({ success: true, data: schemas });
    } catch (error: any) {
      logger.error('Error getting all schemas', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao buscar schemas' });
    }
  }

  private async getSchemaById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const schema = await bibliotecaService.getSchemaById(id as UUID);
      if (!schema) {
        res.status(404).json({ success: false, error: 'Schema não encontrado' });
        return;
      }
      res.json({ success: true, data: schema });
    } catch (error: any) {
      logger.error('Error getting schema by id', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao buscar schema' });
    }
  }

  private async createSchema(req: Request, res: Response): Promise<void> {
    try {
      const { name, folderId, definition, schemaType } = req.body;
      if (!name) {
        res.status(400).json({ success: false, error: 'Nome é obrigatório' });
        return;
      }
      const schema = await bibliotecaService.createSchema({ name, folderId, definition, schemaType });
      res.json({ success: true, data: schema });
    } catch (error: any) {
      logger.error('Error creating schema', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao criar schema' });
    }
  }

  private async updateSchema(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, folderId, definition, schemaType } = req.body;
      const schema = await bibliotecaService.updateSchema(id as UUID, { name, folderId, definition, schemaType });
      res.json({ success: true, data: schema });
    } catch (error: any) {
      logger.error('Error updating schema', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao atualizar schema' });
    }
  }

  private async deleteSchema(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await bibliotecaService.deleteSchema(id as UUID);
      res.json({ success: true, message: 'Schema excluído com sucesso' });
    } catch (error: any) {
      logger.error('Error deleting schema', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao excluir schema' });
    }
  }

  // ========== AGENT FUNCTION CALLS ==========
  private async getAllAgentFunctionCalls(req: Request, res: Response): Promise<void> {
    try {
      const functionCalls = await bibliotecaService.getAllAgentFunctionCalls();
      res.json({ success: true, data: functionCalls });
    } catch (error: any) {
      logger.error('Error getting all agent function calls', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao buscar function calls do agente' });
    }
  }

  private async getAgentFunctionCallById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const fc = await bibliotecaService.getAgentFunctionCallById(id as UUID);
      if (!fc) {
        res.status(404).json({ success: false, error: 'Function call não encontrada' });
        return;
      }
      res.json({ success: true, data: fc });
    } catch (error: any) {
      logger.error('Error getting agent function call by id', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao buscar function call' });
    }
  }

  private async createAgentFunctionCall(req: Request, res: Response): Promise<void> {
    try {
      const data = req.body;
      if (!data.name) {
        res.status(400).json({ success: false, error: 'Nome é obrigatório' });
        return;
      }
      const fc = await bibliotecaService.createAgentFunctionCall(data);
      if (redisService.isConnected()) {
        await redisService.publishConfigUpdate('agent_function_calls');
        logger.info('Published Redis event for agent function calls list update');
      }
      res.json({ success: true, data: fc });
    } catch (error: any) {
      logger.error('Error creating agent function call', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao criar function call' });
    }
  }

  private async updateAgentFunctionCall(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data = req.body;
      const fc = await bibliotecaService.updateAgentFunctionCall(id as UUID, data);
      if (redisService.isConnected()) {
        await redisService.publishConfigUpdate('agent_function_calls');
        logger.info('Published Redis event for agent function calls list update');
      }
      res.json({ success: true, data: fc });
    } catch (error: any) {
      logger.error('Error updating agent function call', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao atualizar function call' });
    }
  }

  private async deleteAgentFunctionCall(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await bibliotecaService.deleteAgentFunctionCall(id as UUID);
      if (redisService.isConnected()) {
        await redisService.publishConfigUpdate('agent_function_calls');
        logger.info('Published Redis event for agent function calls list update');
      }
      res.json({ success: true, message: 'Function call excluída com sucesso' });
    } catch (error: any) {
      logger.error('Error deleting agent function call', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao excluir function call' });
    }
  }

  private async saveAllAgentFunctionCalls(req: Request, res: Response): Promise<void> {
    try {
      const { functionCalls } = req.body;
      if (!Array.isArray(functionCalls)) {
        res.status(400).json({ success: false, error: 'functionCalls deve ser um array' });
        return;
      }
      const saved = await bibliotecaService.saveAllAgentFunctionCalls(functionCalls);
      if (redisService.isConnected()) {
        await redisService.publishConfigUpdate('agent_function_calls');
        logger.info('Published Redis event for agent function calls list update');
      }
      res.json({ success: true, data: saved });
    } catch (error: any) {
      logger.error('Error saving all agent function calls', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao salvar function calls' });
    }
  }
}
