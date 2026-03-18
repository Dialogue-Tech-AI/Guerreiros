import { Router, Request, Response } from 'express';
import {
  multiAgentService,
  SpecialistAgentData,
  RouterData,
  RouterOutputData,
} from '../../application/services/multi-agent.service';
import { logger } from '../../../../shared/utils/logger';

export class MultiAgentController {
  public router: Router;

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Status / config endpoints
    this.router.get('/status', this.getStatus.bind(this));
    this.router.post('/toggle', this.toggle.bind(this));
    this.router.get('/config', this.getConfig.bind(this));
    this.router.put('/config', this.updateConfig.bind(this));

    // Modular routers
    this.router.get('/routers', this.getAllRouters.bind(this));
    this.router.get('/routers/:id', this.getRouterById.bind(this));
    this.router.get('/routers/:id/outputs', this.getRouterOutputs.bind(this));
    this.router.post('/routers', this.createRouter.bind(this));
    this.router.put('/routers/:id', this.updateRouter.bind(this));
    this.router.delete('/routers/:id', this.deleteRouter.bind(this));
    this.router.post('/routers/:id/outputs', this.createRouterOutput.bind(this));
    this.router.put('/routers/:routerId/outputs/:outputId', this.updateRouterOutput.bind(this));
    this.router.delete('/routers/:routerId/outputs/:outputId', this.deleteRouterOutput.bind(this));
    this.router.get('/router/entry', this.getEntryRouter.bind(this));
    this.router.put('/router/entry', this.setEntryRouter.bind(this));

    // Specialist agents endpoints
    this.router.get('/specialists', this.getAllSpecialists.bind(this));
    this.router.get('/specialists/:id', this.getSpecialistById.bind(this));
    this.router.post('/specialists', this.createSpecialist.bind(this));
    this.router.put('/specialists/:id', this.updateSpecialist.bind(this));
    this.router.delete('/specialists/:id', this.deleteSpecialist.bind(this));
  }

  private async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const config = await multiAgentService.getMultiAgentConfig();
      res.json({
        success: true,
        data: {
          isEnabled: config.isEnabled,
          universalPrompt: config.universalPrompt ?? undefined,
          universalFunctionCalls: config.universalFunctionCalls ?? undefined,
        },
      });
    } catch (error: any) {
      logger.error('Error in getStatus controller', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Erro ao verificar status do multi-agentes',
      });
    }
  }

  private async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const config = await multiAgentService.getMultiAgentConfig();
      res.json({
        success: true,
        data: {
          isEnabled: config.isEnabled,
          universalPrompt: config.universalPrompt ?? undefined,
          universalFunctionCalls: config.universalFunctionCalls ?? undefined,
          entryRouterId: config.entryRouterId ?? undefined,
          workflowId: config.workflowId ?? undefined,
        },
      });
    } catch (error: any) {
      logger.error('Error in getConfig controller', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar configuração do multi-agentes',
      });
    }
  }

  private async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      const { universalPrompt, universalFunctionCalls } = req.body;
      if (
        universalPrompt !== undefined &&
        universalPrompt !== null &&
        typeof universalPrompt !== 'string'
      ) {
        res.status(400).json({
          success: false,
          error: 'Campo "universalPrompt" deve ser string ou null',
        });
        return;
      }
      if (universalFunctionCalls !== undefined && universalFunctionCalls !== null) {
        if (!Array.isArray(universalFunctionCalls)) {
          res.status(400).json({
            success: false,
            error: 'Campo "universalFunctionCalls" deve ser array de strings ou null',
          });
          return;
        }
        if (universalFunctionCalls.some((x: unknown) => typeof x !== 'string')) {
          res.status(400).json({
            success: false,
            error: 'Campo "universalFunctionCalls" deve conter apenas strings',
          });
          return;
        }
      }
      const { entryRouterId, workflowId } = req.body;
      const updates: {
        universalPrompt?: string | null;
        universalFunctionCalls?: string[] | null;
        entryRouterId?: string | null;
        workflowId?: string | null;
      } = {};
      if (universalPrompt !== undefined) updates.universalPrompt = universalPrompt as string | null;
      if (universalFunctionCalls !== undefined)
        updates.universalFunctionCalls = universalFunctionCalls as string[] | null;
      if (entryRouterId !== undefined) updates.entryRouterId = entryRouterId === null || entryRouterId === '' ? null : (entryRouterId as string);
      if (workflowId !== undefined) updates.workflowId = workflowId === null || workflowId === '' ? null : (workflowId as string);
      const config = await multiAgentService.updateMultiAgentConfigPartial(updates);
      res.json({
        success: true,
        data: {
          isEnabled: config.isEnabled,
          universalPrompt: config.universalPrompt ?? undefined,
          universalFunctionCalls: config.universalFunctionCalls ?? undefined,
          entryRouterId: config.entryRouterId ?? undefined,
          workflowId: config.workflowId ?? undefined,
        },
      });
    } catch (error: any) {
      logger.error('Error in updateConfig controller', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Erro ao atualizar configuração do multi-agentes',
      });
    }
  }

  private async toggle(req: Request, res: Response): Promise<void> {
    try {
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Campo "enabled" deve ser um boolean',
        });
        return;
      }

      // Validate entry router is set when enabling (modular routers only)
      if (enabled) {
        const config = await multiAgentService.getMultiAgentConfig();
        if (!config.entryRouterId && !config.workflowId) {
          res.status(400).json({
            success: false,
            error:
              'Defina um workflow ativo ou um roteador de entrada na seção Roteadores antes de ativar multi-agentes',
          });
          return;
        }
      }

      const config = await multiAgentService.toggleMultiAgent(enabled);

      res.json({
        success: true,
        data: {
          isEnabled: config.isEnabled,
        },
      });
    } catch (error: any) {
      logger.error('Error in toggle controller', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Erro ao alterar status do multi-agentes',
      });
    }
  }

  private async getAllSpecialists(req: Request, res: Response): Promise<void> {
    try {
      const specialists = await multiAgentService.getAllSpecialists();
      res.json({
        success: true,
        data: specialists,
      });
    } catch (error: any) {
      logger.error('Error in getAllSpecialists controller', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar agentes especialistas',
      });
    }
  }

  private async getSpecialistById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const specialist = await multiAgentService.getSpecialistById(id);

      if (!specialist) {
        res.status(404).json({
          success: false,
          error: 'Agente especialista não encontrado',
        });
        return;
      }

      res.json({
        success: true,
        data: specialist,
      });
    } catch (error: any) {
      logger.error('Error in getSpecialistById controller', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar agente especialista',
      });
    }
  }

  private async createSpecialist(req: Request, res: Response): Promise<void> {
    try {
      const { name, prompt, model, temperature, functionCallNames, isActive } = req.body;

      if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({
          success: false,
          error: 'Campo "name" é obrigatório',
        });
        return;
      }

      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        res.status(400).json({
          success: false,
          error: 'Campo "prompt" é obrigatório',
        });
        return;
      }

      if (!model || typeof model !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Campo "model" é obrigatório',
        });
        return;
      }

      if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
        res.status(400).json({
          success: false,
          error: 'Campo "temperature" deve ser um número entre 0 e 2',
        });
        return;
      }

      const specialist = await multiAgentService.createSpecialist({
        name: name.trim(),
        prompt,
        model,
        temperature,
        functionCallNames: Array.isArray(functionCallNames) ? functionCallNames : [],
        isActive: isActive !== undefined ? isActive : true,
      });

      res.status(201).json({
        success: true,
        data: specialist,
      });
    } catch (error: any) {
      logger.error('Error in createSpecialist controller', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao criar agente especialista',
      });
    }
  }

  private async updateSpecialist(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, prompt, model, temperature, functionCallNames, isActive } = req.body;

      if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
        res.status(400).json({
          success: false,
          error: 'Campo "temperature" deve ser um número entre 0 e 2',
        });
        return;
      }

      const updateData: Partial<SpecialistAgentData> = {};
      if (name !== undefined) updateData.name = name.trim();
      if (prompt !== undefined) updateData.prompt = prompt;
      if (model !== undefined) updateData.model = model;
      if (temperature !== undefined) updateData.temperature = temperature;
      if (functionCallNames !== undefined) updateData.functionCallNames = Array.isArray(functionCallNames) ? functionCallNames : [];
      if (isActive !== undefined) updateData.isActive = isActive;

      const specialist = await multiAgentService.updateSpecialist(id, updateData);

      res.json({
        success: true,
        data: specialist,
      });
    } catch (error: any) {
      logger.error('Error in updateSpecialist controller', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao atualizar agente especialista',
      });
    }
  }

  private async deleteSpecialist(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await multiAgentService.deleteSpecialist(id);

      res.json({
        success: true,
        message: 'Agente especialista removido com sucesso',
      });
    } catch (error: any) {
      logger.error('Error in deleteSpecialist controller', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao remover agente especialista',
      });
    }
  }

  // ---------- Modular routers ----------

  private async getEntryRouter(req: Request, res: Response): Promise<void> {
    try {
      const entryRouterId = await multiAgentService.getEntryRouterId();
      res.json({ success: true, data: { entryRouterId: entryRouterId ?? undefined } });
    } catch (error: any) {
      logger.error('Error in getEntryRouter controller', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao buscar roteador de entrada' });
    }
  }

  private async setEntryRouter(req: Request, res: Response): Promise<void> {
    try {
      const { entryRouterId } = req.body;
      const id = entryRouterId === null || entryRouterId === '' ? null : (entryRouterId as string);
      await multiAgentService.setEntryRouterId(id);
      res.json({ success: true, data: { entryRouterId: id ?? undefined } });
    } catch (error: any) {
      logger.error('Error in setEntryRouter controller', { error: error.message });
      res.status(500).json({ success: false, error: error.message || 'Erro ao definir roteador de entrada' });
    }
  }

  private async getAllRouters(req: Request, res: Response): Promise<void> {
    try {
      const routers = await multiAgentService.getAllRouters();
      res.json({ success: true, data: routers });
    } catch (error: any) {
      logger.error('Error in getAllRouters controller', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao listar roteadores' });
    }
  }

  private async getRouterById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const withOutputs = req.query.outputs === 'true';
      if (withOutputs) {
        const result = await multiAgentService.getRouterByIdWithOutputs(id);
        if (!result) {
          res.status(404).json({ success: false, error: 'Roteador não encontrado' });
          return;
        }
        res.json({ success: true, data: result });
        return;
      }
      const router = await multiAgentService.getRouterById(id);
      if (!router) {
        res.status(404).json({ success: false, error: 'Roteador não encontrado' });
        return;
      }
      res.json({ success: true, data: router });
    } catch (error: any) {
      logger.error('Error in getRouterById controller', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao buscar roteador' });
    }
  }

  private async getRouterOutputs(req: Request, res: Response): Promise<void> {
    try {
      const { id: routerId } = req.params;
      const outputs = await multiAgentService.getRouterOutputs(routerId);
      res.json({ success: true, data: outputs });
    } catch (error: any) {
      logger.error('Error in getRouterOutputs controller', { error: error.message });
      res.status(500).json({ success: false, error: 'Erro ao listar saídas do roteador' });
    }
  }

  private async createRouter(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, routerType, prompt, model, temperature, config, isActive } = req.body;
      if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ success: false, error: 'Campo "name" é obrigatório' });
        return;
      }
      const data: RouterData = {
        name: name.trim(),
        description: description ?? null,
        routerType: routerType ?? 'llm_choice',
        prompt: prompt ?? null,
        model: model ?? null,
        temperature: temperature ?? null,
        config: config ?? null,
        isActive: isActive !== undefined ? isActive : true,
      };
      const router = await multiAgentService.createRouter(data);
      res.status(201).json({ success: true, data: router });
    } catch (error: any) {
      logger.error('Error in createRouter controller', { error: error.message });
      res.status(500).json({ success: false, error: error.message || 'Erro ao criar roteador' });
    }
  }

  private async updateRouter(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, description, routerType, prompt, model, temperature, config, isActive } = req.body;
      const data: Partial<RouterData> = {};
      if (name !== undefined) data.name = typeof name === 'string' ? name.trim() : name;
      if (description !== undefined) data.description = description;
      if (routerType !== undefined) data.routerType = routerType;
      if (prompt !== undefined) data.prompt = prompt;
      if (model !== undefined) data.model = model;
      if (temperature !== undefined) data.temperature = temperature;
      if (config !== undefined) data.config = config;
      if (isActive !== undefined) data.isActive = isActive;
      const router = await multiAgentService.updateRouter(id, data);
      res.json({ success: true, data: router });
    } catch (error: any) {
      logger.error('Error in updateRouter controller', { error: error.message });
      res.status(500).json({ success: false, error: error.message || 'Erro ao atualizar roteador' });
    }
  }

  private async deleteRouter(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await multiAgentService.deleteRouter(id);
      res.json({ success: true, message: 'Roteador removido com sucesso' });
    } catch (error: any) {
      logger.error('Error in deleteRouter controller', { error: error.message });
      res.status(500).json({ success: false, error: error.message || 'Erro ao remover roteador' });
    }
  }

  private async createRouterOutput(req: Request, res: Response): Promise<void> {
    try {
      const { id: routerId } = req.params;
      const { label, conditionType, conditionValue, destinationType, destinationId, responseText, isFallback, orderIndex, isActive } = req.body;
      if (!label || typeof label !== 'string' || label.trim() === '') {
        res.status(400).json({ success: false, error: 'Campo "label" é obrigatório' });
        return;
      }
      if (!destinationType || !['specialist', 'router', 'fixed'].includes(destinationType)) {
        res.status(400).json({ success: false, error: 'Campo "destinationType" deve ser specialist, router ou fixed' });
        return;
      }
      const data: RouterOutputData = {
        label: label.trim(),
        conditionType: conditionType ?? null,
        conditionValue: conditionValue ?? null,
        destinationType,
        destinationId: destinationId ?? null,
        responseText: responseText ?? null,
        isFallback: isFallback ?? false,
        orderIndex: orderIndex ?? 0,
        isActive: isActive !== undefined ? isActive : true,
      };
      const output = await multiAgentService.createRouterOutput(routerId, data);
      res.status(201).json({ success: true, data: output });
    } catch (error: any) {
      logger.error('Error in createRouterOutput controller', { error: error.message });
      res.status(500).json({ success: false, error: error.message || 'Erro ao criar saída do roteador' });
    }
  }

  private async updateRouterOutput(req: Request, res: Response): Promise<void> {
    try {
      const { outputId } = req.params;
      const { label, conditionType, conditionValue, destinationType, destinationId, responseText, isFallback, orderIndex, isActive } = req.body;
      const data: Partial<RouterOutputData> = {};
      if (label !== undefined) data.label = label;
      if (conditionType !== undefined) data.conditionType = conditionType;
      if (conditionValue !== undefined) data.conditionValue = conditionValue;
      if (destinationType !== undefined) data.destinationType = destinationType;
      if (destinationId !== undefined) data.destinationId = destinationId;
      if (responseText !== undefined) data.responseText = responseText;
      if (isFallback !== undefined) data.isFallback = isFallback;
      if (orderIndex !== undefined) data.orderIndex = orderIndex;
      if (isActive !== undefined) data.isActive = isActive;
      const output = await multiAgentService.updateRouterOutput(outputId, data);
      res.json({ success: true, data: output });
    } catch (error: any) {
      logger.error('Error in updateRouterOutput controller', { error: error.message });
      res.status(500).json({ success: false, error: error.message || 'Erro ao atualizar saída do roteador' });
    }
  }

  private async deleteRouterOutput(req: Request, res: Response): Promise<void> {
    try {
      const { outputId } = req.params;
      await multiAgentService.deleteRouterOutput(outputId);
      res.json({ success: true, message: 'Saída do roteador removida com sucesso' });
    } catch (error: any) {
      logger.error('Error in deleteRouterOutput controller', { error: error.message });
      res.status(500).json({ success: false, error: error.message || 'Erro ao remover saída do roteador' });
    }
  }
}
