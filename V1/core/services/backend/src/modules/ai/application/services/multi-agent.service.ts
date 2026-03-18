// @ts-nocheck
import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { MultiAgentConfig } from '../../domain/entities/multi-agent-config.entity';
import { RouterAgentConfig } from '../../domain/entities/router-agent-config.entity';
import { SpecialistAgent } from '../../domain/entities/specialist-agent.entity';
import { Router, RouterType } from '../../domain/entities/router.entity';
import { RouterOutput, DestinationType } from '../../domain/entities/router-output.entity';
import { logger } from '../../../../shared/utils/logger';
import { redisService } from '../../../../shared/infrastructure/redis/redis.service';
import { UUID } from '../../../../shared/types/common.types';

export interface SpecialistAgentData {
  name: string;
  prompt: string;
  model: string;
  temperature: number;
  functionCallNames?: string[];
  isActive?: boolean;
}

export interface RouterData {
  name: string;
  description?: string | null;
  routerType?: RouterType;
  prompt?: string | null;
  model?: string | null;
  temperature?: number | null;
  config?: Record<string, unknown> | null;
  isActive?: boolean;
}

export interface RouterOutputData {
  label: string;
  conditionType?: string | null;
  conditionValue?: Record<string, unknown> | null;
  destinationType: DestinationType;
  destinationId?: UUID | null;
  responseText?: string | null;
  isFallback?: boolean;
  orderIndex?: number;
  isActive?: boolean;
}

export class MultiAgentService {
  private multiAgentConfigRepository = AppDataSource.getRepository(MultiAgentConfig);
  private routerConfigRepository = AppDataSource.getRepository(RouterAgentConfig);
  private specialistAgentRepository = AppDataSource.getRepository(SpecialistAgent);
  private routerRepository = AppDataSource.getRepository(Router);
  private routerOutputRepository = AppDataSource.getRepository(RouterOutput);

  /**
   * Check if multi-agent mode is enabled
   */
  async isMultiAgentEnabled(): Promise<boolean> {
    try {
      const config = await this.getMultiAgentConfig();
      return config.isEnabled;
    } catch (error: any) {
      logger.error('Error checking multi-agent status', { error: error.message });
      return false;
    }
  }

  /**
   * Get multi-agent config (status + universal prompt + universal function calls + entry router)
   */
  async getMultiAgentConfig(): Promise<{
    isEnabled: boolean;
    universalPrompt: string | null;
    universalFunctionCalls: string[] | null;
    entryRouterId: UUID | null;
    workflowId: UUID | null;
  }> {
    try {
      const config = await this.multiAgentConfigRepository.findOne({
        where: {},
        order: { createdAt: 'DESC' },
      });

      return {
        isEnabled: config?.isEnabled ?? false,
        universalPrompt: config?.universalPrompt ?? null,
        universalFunctionCalls: config?.universalFunctionCalls ?? null,
        entryRouterId: config?.entryRouterId ?? null,
        workflowId: config?.workflowId ?? null,
      };
    } catch (error: any) {
      logger.error('Error getting multi-agent config', { error: error.message });
      return { isEnabled: false, universalPrompt: null, universalFunctionCalls: null, entryRouterId: null, workflowId: null };
    }
  }

  /**
   * Update universal prompt (used in all specialist agents)
   */
  async updateUniversalPrompt(universalPrompt: string | null): Promise<MultiAgentConfig> {
    return this.updateMultiAgentConfigPartial({ universalPrompt });
  }

  /**
   * Update multi-agent config partial (universal prompt, universal function calls, entry router)
   */
  async updateMultiAgentConfigPartial(updates: {
    universalPrompt?: string | null;
    universalFunctionCalls?: string[] | null;
    entryRouterId?: UUID | null;
    workflowId?: UUID | null;
  }): Promise<MultiAgentConfig> {
    try {
      let config = await this.multiAgentConfigRepository.findOne({
        where: {},
        order: { createdAt: 'DESC' },
      });

      if (!config) {
        config = this.multiAgentConfigRepository.create({
          isEnabled: false,
          universalPrompt: updates.universalPrompt ?? null,
          universalFunctionCalls: updates.universalFunctionCalls ?? null,
          entryRouterId: updates.entryRouterId ?? null,
          workflowId: updates.workflowId ?? null,
        });
      } else {
        if (updates.universalPrompt !== undefined) config.universalPrompt = updates.universalPrompt ?? null;
        if (updates.universalFunctionCalls !== undefined)
          config.universalFunctionCalls = updates.universalFunctionCalls ?? null;
        if (updates.entryRouterId !== undefined) config.entryRouterId = updates.entryRouterId ?? null;
        if (updates.workflowId !== undefined) config.workflowId = updates.workflowId ?? null;
      }

      const saved = await this.multiAgentConfigRepository.save(config);
      await this.invalidateCache();
      if (updates.universalPrompt !== undefined) logger.info('Universal prompt updated');
      if (updates.universalFunctionCalls !== undefined) logger.info('Universal function calls updated');
      if (updates.entryRouterId !== undefined) logger.info('Entry router updated', { entryRouterId: updates.entryRouterId });
      if (updates.workflowId !== undefined) logger.info('Workflow updated', { workflowId: updates.workflowId });
      return saved;
    } catch (error: any) {
      logger.error('Error updating multi-agent config', { error: error.message });
      throw error;
    }
  }

  /**
   * Toggle multi-agent mode
   */
  async toggleMultiAgent(enabled: boolean): Promise<MultiAgentConfig> {
    try {
      let config = await this.multiAgentConfigRepository.findOne({
        where: {},
        order: { createdAt: 'DESC' },
      });

      if (!config) {
        config = this.multiAgentConfigRepository.create({
          isEnabled: enabled,
          universalPrompt: null,
        });
      } else {
        config.isEnabled = enabled;
      }

      const saved = await this.multiAgentConfigRepository.save(config);

      // Invalidate Redis cache
      await this.invalidateCache();

      logger.info('Multi-agent mode toggled', { enabled });
      return saved;
    } catch (error: any) {
      logger.error('Error toggling multi-agent mode', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete specialist agent (validates no router_outputs reference it)
   */
  async deleteSpecialist(id: string): Promise<void> {
    try {
      const agent = await this.getSpecialistById(id);
      if (!agent) {
        throw new Error(`Agente especialista com ID "${id}" não encontrado`);
      }

      const referrers = await this.getSpecialistReferrers(id);
      if (referrers.length > 0) {
        throw new Error(
          `Não é possível excluir o agente "${agent.name}" pois está em uso como destino nos roteadores: ${referrers.map((r) => r.routerName).join(', ')}. Remova ou altere as referências primeiro.`
        );
      }

      await this.specialistAgentRepository.remove(agent);
      await this.invalidateCache();
      logger.info('Specialist agent deleted', { id, name: agent.name });
    } catch (error: any) {
      logger.error('Error deleting specialist agent', { error: error.message, id });
      throw error;
    }
  }

  /** Get routers that reference this specialist as destination */
  async getSpecialistReferrers(specialistId: string): Promise<{ routerId: string; routerName: string }[]> {
    const outputs = await this.routerOutputRepository.find({
      where: { destinationType: 'specialist', destinationId: specialistId },
      relations: ['router'],
    });
    return outputs.map((o) => ({
      routerId: o.routerId,
      routerName: o.router?.name ?? o.routerId,
    }));
  }

  /**
   * Get all specialist agents
   */
  async getAllSpecialists(): Promise<SpecialistAgent[]> {
    try {
      return await this.specialistAgentRepository.find({
        order: { createdAt: 'DESC' },
      });
    } catch (error: any) {
      logger.error('Error getting all specialists', { error: error.message });
      throw error;
    }
  }

  /**
   * Get specialist agent by ID
   */
  async getSpecialistById(id: string): Promise<SpecialistAgent | null> {
    try {
      return await this.specialistAgentRepository.findOne({
        where: { id },
      });
    } catch (error: any) {
      logger.error('Error getting specialist by ID', { error: error.message, id });
      throw error;
    }
  }

  /**
   * Get specialist agent by name
   */
  async getSpecialistByName(name: string): Promise<SpecialistAgent | null> {
    try {
      return await this.specialistAgentRepository.findOne({
        where: { name },
      });
    } catch (error: any) {
      logger.error('Error getting specialist by name', { error: error.message, name });
      throw error;
    }
  }

  /**
   * Create new specialist agent
   */
  async createSpecialist(data: SpecialistAgentData): Promise<SpecialistAgent> {
    try {
      // Check if name already exists
      const existing = await this.getSpecialistByName(data.name);
      if (existing) {
        throw new Error(`Agente especialista com nome "${data.name}" já existe`);
      }

      const agent = this.specialistAgentRepository.create({
        name: data.name,
        prompt: data.prompt,
        model: data.model,
        temperature: data.temperature ?? 0.7,
        functionCallNames: data.functionCallNames || [],
        isActive: data.isActive ?? true,
      });

      const saved = await this.specialistAgentRepository.save(agent);

      // Invalidate Redis cache
      await this.invalidateCache();

      logger.info('Specialist agent created', { id: saved.id, name: saved.name });
      return saved;
    } catch (error: any) {
      logger.error('Error creating specialist agent', { error: error.message });
      throw error;
    }
  }

  /**
   * Update specialist agent
   */
  async updateSpecialist(id: string, data: Partial<SpecialistAgentData>): Promise<SpecialistAgent> {
    try {
      const agent = await this.getSpecialistById(id);
      if (!agent) {
        throw new Error(`Agente especialista com ID "${id}" não encontrado`);
      }

      // If name is being changed, check if new name already exists
      if (data.name && data.name !== agent.name) {
        const existing = await this.getSpecialistByName(data.name);
        if (existing) {
          throw new Error(`Agente especialista com nome "${data.name}" já existe`);
        }
        agent.name = data.name;
      }

      if (data.prompt !== undefined) agent.prompt = data.prompt;
      if (data.model !== undefined) agent.model = data.model;
      if (data.temperature !== undefined) agent.temperature = data.temperature;
      if (data.functionCallNames !== undefined) agent.functionCallNames = data.functionCallNames;
      if (data.isActive !== undefined) agent.isActive = data.isActive;

      const saved = await this.specialistAgentRepository.save(agent);

      // Invalidate Redis cache
      await this.invalidateCache();

      logger.info('Specialist agent updated', { id: saved.id, name: saved.name });
      return saved;
    } catch (error: any) {
      logger.error('Error updating specialist agent', { error: error.message, id });
      throw error;
    }
  }

  // ---------- Modular routers ----------

  async getEntryRouterId(): Promise<UUID | null> {
    const config = await this.getMultiAgentConfig();
    return config.entryRouterId ?? null;
  }

  async setEntryRouterId(entryRouterId: UUID | null): Promise<MultiAgentConfig> {
    return this.updateMultiAgentConfigPartial({ entryRouterId });
  }

  async getAllRouters(): Promise<Router[]> {
    return this.routerRepository.find({ order: { name: 'ASC' } });
  }

  async getRouterById(id: string): Promise<Router | null> {
    return this.routerRepository.findOne({ where: { id } });
  }

  async getRouterByIdWithOutputs(id: string): Promise<{ router: Router; outputs: RouterOutput[] } | null> {
    const router = await this.routerRepository.findOne({ where: { id } });
    if (!router) return null;
    const outputs = await this.routerOutputRepository.find({
      where: { routerId: id },
      order: { orderIndex: 'ASC', createdAt: 'ASC' },
    });
    return { router, outputs };
  }

  async getRouterByName(name: string): Promise<Router | null> {
    return this.routerRepository.findOne({ where: { name } });
  }

  async createRouter(data: RouterData): Promise<Router> {
    const existing = await this.getRouterByName(data.name);
    if (existing) {
      throw new Error(`Roteador com nome "${data.name}" já existe`);
    }
    const router = this.routerRepository.create({
      name: data.name,
      description: data.description ?? null,
      routerType: (data.routerType as RouterType) ?? 'llm_choice',
      prompt: data.prompt ?? null,
      model: data.model ?? null,
      temperature: data.temperature ?? null,
      config: data.config ?? null,
      isActive: data.isActive ?? true,
    });
    const saved = await this.routerRepository.save(router);
    await this.invalidateCache();
    logger.info('Router created', { id: saved.id, name: saved.name });
    return saved;
  }

  async updateRouter(id: string, data: Partial<RouterData>): Promise<Router> {
    const router = await this.getRouterById(id);
    if (!router) {
      throw new Error(`Roteador com ID "${id}" não encontrado`);
    }
    if (data.name !== undefined && data.name !== router.name) {
      const existing = await this.getRouterByName(data.name);
      if (existing) throw new Error(`Roteador com nome "${data.name}" já existe`);
      router.name = data.name;
    }
    if (data.description !== undefined) router.description = data.description ?? null;
    if (data.routerType !== undefined) router.routerType = data.routerType as RouterType;
    if (data.prompt !== undefined) router.prompt = data.prompt ?? null;
    if (data.model !== undefined) router.model = data.model ?? null;
    if (data.temperature !== undefined) router.temperature = data.temperature ?? null;
    if (data.config !== undefined) router.config = data.config ?? null;
    if (data.isActive !== undefined) router.isActive = data.isActive;
    const saved = await this.routerRepository.save(router);
    await this.invalidateCache();
    logger.info('Router updated', { id: saved.id, name: saved.name });
    return saved;
  }

  async deleteRouter(id: string): Promise<void> {
    const router = await this.getRouterById(id);
    if (!router) {
      throw new Error(`Roteador com ID "${id}" não encontrado`);
    }
    const referrers = await this.getRouterReferrers(id);
    if (referrers.length > 0) {
      throw new Error(
        `Não é possível excluir o roteador "${router.name}" pois está em uso como destino em: ${referrers.join(', ')}. Remova ou altere as referências primeiro.`
      );
    }
    await this.routerOutputRepository.delete({ routerId: id });
    await this.routerRepository.remove(router);
    await this.invalidateCache();
    logger.info('Router deleted', { id, name: router.name });
  }

  /** Get router names that reference this router as destination */
  async getRouterReferrers(routerId: string): Promise<string[]> {
    const outputs = await this.routerOutputRepository.find({
      where: { destinationType: 'router', destinationId: routerId },
      relations: ['router'],
    });
    return outputs.map((o) => o.router?.name ?? o.routerId).filter(Boolean);
  }

  async getRouterOutputs(routerId: string): Promise<RouterOutput[]> {
    return this.routerOutputRepository.find({
      where: { routerId },
      order: { orderIndex: 'ASC', createdAt: 'ASC' },
    });
  }

  async createRouterOutput(routerId: string, data: RouterOutputData): Promise<RouterOutput> {
    const router = await this.getRouterById(routerId);
    if (!router) throw new Error(`Roteador com ID "${routerId}" não encontrado`);
    const output = this.routerOutputRepository.create({
      routerId,
      label: data.label,
      conditionType: data.conditionType ?? null,
      conditionValue: data.conditionValue ?? null,
      destinationType: data.destinationType,
      destinationId: data.destinationId ?? null,
      responseText: data.responseText ?? null,
      isFallback: data.isFallback ?? false,
      orderIndex: data.orderIndex ?? 0,
      isActive: data.isActive ?? true,
    });
    const saved = await this.routerOutputRepository.save(output);
    await this.invalidateCache();
    return saved;
  }

  async updateRouterOutput(outputId: string, data: Partial<RouterOutputData>): Promise<RouterOutput> {
    const output = await this.routerOutputRepository.findOne({ where: { id: outputId } });
    if (!output) throw new Error(`Saída de roteador com ID "${outputId}" não encontrada`);
    if (data.label !== undefined) output.label = data.label;
    if (data.conditionType !== undefined) output.conditionType = data.conditionType ?? null;
    if (data.conditionValue !== undefined) output.conditionValue = data.conditionValue ?? null;
    if (data.destinationType !== undefined) output.destinationType = data.destinationType;
    if (data.destinationId !== undefined) output.destinationId = data.destinationId ?? null;
    if (data.responseText !== undefined) output.responseText = data.responseText ?? null;
    if (data.isFallback !== undefined) output.isFallback = data.isFallback;
    if (data.orderIndex !== undefined) output.orderIndex = data.orderIndex;
    if (data.isActive !== undefined) output.isActive = data.isActive;
    const saved = await this.routerOutputRepository.save(output);
    await this.invalidateCache();
    return saved;
  }

  async deleteRouterOutput(outputId: string): Promise<void> {
    const output = await this.routerOutputRepository.findOne({ where: { id: outputId } });
    if (!output) throw new Error(`Saída de roteador com ID "${outputId}" não encontrada`);
    await this.routerOutputRepository.remove(output);
    await this.invalidateCache();
  }

  /**
   * Invalidate Redis cache for multi-agent configs
   */
  private async invalidateCache(): Promise<void> {
    try {
      await redisService.publish('ai:config:update', {
        type: 'multi_agent_config',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.warn('Failed to invalidate Redis cache', { error: error.message });
    }
  }
}

export const multiAgentService = new MultiAgentService();
