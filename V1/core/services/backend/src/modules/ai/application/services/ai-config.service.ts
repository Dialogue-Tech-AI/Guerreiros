import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { AIConfig } from '../../domain/entities/ai-config.entity';
import { SpecialistAgent } from '../../domain/entities/specialist-agent.entity';
import { MultiAgentConfig } from '../../domain/entities/multi-agent-config.entity';
import { logger } from '../../../../shared/utils/logger';
import { FunctionCallConfigService } from './function-call-config.service';
import { FunctionCallInputService } from './function-call-input.service';

export interface PendingFunctionConfig {
  orcamento: {
    enabled: boolean;
    description?: string;
  };
  fechamento: {
    enabled: boolean;
    description?: string;
  };
  garantias: {
    enabled: boolean;
    description?: string;
  };
  encomendas: {
    enabled: boolean;
    description?: string;
  };
  chamado_humano: {
    enabled: boolean;
    description?: string;
  };
}

export class AIConfigService {
  private configRepository = AppDataSource.getRepository(AIConfig);
  private specialistAgentRepository = AppDataSource.getRepository(SpecialistAgent);
  private multiAgentConfigRepository = AppDataSource.getRepository(MultiAgentConfig);
  private functionCallConfigService = new FunctionCallConfigService();
  private functionCallInputService = new FunctionCallInputService();

  /**
   * Get agent prompt
   * O prompt deve estar configurado no Super Admin - não há fallback para prompt default
   */
  async getAgentPrompt(): Promise<string> {
    try {
      const config = await this.configRepository.findOne({
        where: { key: 'agent_prompt' },
      });

      if (!config || !config.value || config.value.trim() === '') {
        const error = new Error('Agent prompt não configurado. Configure o prompt no Super Admin.');
        logger.error('Agent prompt not found or empty', { 
          error: error.message,
          key: 'agent_prompt',
        });
        throw error;
      }

      return config.value;
    } catch (error: any) {
      logger.error('Error getting agent prompt', { error: error.message });
      throw error;
    }
  }

  /**
   * Update agent prompt
   */
  async updateAgentPrompt(prompt: string): Promise<AIConfig> {
    try {
      let config = await this.configRepository.findOne({
        where: { key: 'agent_prompt' },
      });

      if (!config) {
        config = this.configRepository.create({
          key: 'agent_prompt',
          value: prompt,
          metadata: {
            version: '1.0',
            description: 'Prompt base do agente',
            updatedAt: new Date().toISOString(),
          },
        });
      } else {
        config.value = prompt;
        config.metadata = {
          ...(config.metadata || {}),
          updatedAt: new Date().toISOString(),
        };
      }

      return await this.configRepository.save(config);
    } catch (error: any) {
      logger.error('Error updating agent prompt', { error: error.message });
      throw error;
    }
  }

  /**
   * Get image description prompt
   */
  async getImageDescriptionPrompt(): Promise<string> {
    try {
      const config = await this.configRepository.findOne({
        where: { key: 'image_description_prompt' },
      });

      if (!config || !config.value || config.value.trim() === '') {
        // Retornar prompt padrão se não estiver configurado
        return `Você é um assistente especializado em análise de imagens para uma loja de autopeças.

Sua tarefa é analisar a imagem fornecida e descrever TUDO que você vê, incluindo:

1. DESCRIÇÃO VISUAL COMPLETA:
   - O que aparece na imagem (objetos, pessoas, cenários, etc.)
   - Cores, formas, texturas
   - Qualquer elemento visível

2. EXTRAÇÃO DE TEXTO (OCR):
   - TODO texto visível na imagem
   - Números, códigos, letras
   - Etiquetas, placas, rótulos
   - Transcreva EXATAMENTE como aparece

3. SE FOR PEÇA AUTOMOTIVA:
   - Tipo de peça (filtro, pastilha, óleo, etc.)
   - Marca e modelo se visível
   - Código da peça se houver
   - Estado (novo, usado, danificado)
   - Características físicas

4. OUTRAS INFORMAÇÕES:
   - Qualquer informação relevante que possa ajudar a identificar ou entender a imagem

IMPORTANTE: 
- Você DEVE analisar a imagem e fornecer uma descrição completa
- NÃO diga que não pode analisar - você TEM a capacidade de ver e descrever imagens
- Seja específico e detalhado
- Responda APENAS com a descrição da imagem, sem desculpas ou recusas

Responda em português brasileiro de forma clara e objetiva.`;
      }

      return config.value;
    } catch (error: any) {
      logger.error('Error getting image description prompt', { error: error.message });
      throw error;
    }
  }

  /**
   * Update image description prompt
   */
  async updateImageDescriptionPrompt(prompt: string): Promise<AIConfig> {
    try {
      let config = await this.configRepository.findOne({
        where: { key: 'image_description_prompt' },
      });

      if (!config) {
        config = this.configRepository.create({
          key: 'image_description_prompt',
          value: prompt,
          metadata: {
            version: '1.0',
            description: 'Prompt para descrição de imagens usando GPT-4o Vision',
            updatedAt: new Date().toISOString(),
          },
        });
      } else {
        config.value = prompt;
        config.metadata = {
          ...(config.metadata || {}),
          updatedAt: new Date().toISOString(),
        };
      }

      const saved = await this.configRepository.save(config);

      // Publish Redis event to notify ai-workers to invalidate cache
      try {
        const { redisService } = await import('../../../../shared/infrastructure/redis/redis.service');
        if (redisService.isConnected()) {
          await redisService.publishConfigUpdate('image_description_prompt');
          logger.info('✅ Published Redis event for image description prompt cache invalidation');
        }
      } catch (redisError: any) {
        logger.warn('Could not publish Redis event for image description prompt', {
          error: redisError.message,
        });
      }

      return saved;
    } catch (error: any) {
      logger.error('Error updating image description prompt', { error: error.message });
      throw error;
    }
  }

  /**
   * Get pending functions configuration
   */
  async getPendingFunctionsConfig(): Promise<PendingFunctionConfig> {
    try {
      const config = await this.configRepository.findOne({
        where: { key: 'pending_functions' },
      });

      if (!config) {
        // Return default config
        return {
          orcamento: { enabled: true },
          fechamento: { enabled: true },
          garantias: { enabled: true },
          encomendas: { enabled: true },
          chamado_humano: { enabled: true },
        };
      }

      return JSON.parse(config.value) as PendingFunctionConfig;
    } catch (error: any) {
      logger.error('Error getting pending functions config', { error: error.message });
      // Return default config on error
      return {
        orcamento: { enabled: true },
        fechamento: { enabled: true },
        garantias: { enabled: true },
        encomendas: { enabled: true },
        chamado_humano: { enabled: true },
      };
    }
  }

  /**
   * Update pending functions configuration
   */
  async updatePendingFunctionsConfig(
    config: PendingFunctionConfig
  ): Promise<AIConfig> {
    try {
      let aiConfig = await this.configRepository.findOne({
        where: { key: 'pending_functions' },
      });

      if (!aiConfig) {
        aiConfig = this.configRepository.create({
          key: 'pending_functions',
          value: JSON.stringify(config),
          metadata: {
            version: '1.0',
            description: 'Configurações das function calls de pendências',
            updatedAt: new Date().toISOString(),
          },
        });
      } else {
        aiConfig.value = JSON.stringify(config);
        aiConfig.metadata = {
          ...(aiConfig.metadata || {}),
          updatedAt: new Date().toISOString(),
        };
      }

      return await this.configRepository.save(aiConfig);
    } catch (error: any) {
      logger.error('Error updating pending functions config', { error: error.message });
      throw error;
    }
  }

  /**
   * Get all configurations
   */
  async getAllConfigs(): Promise<{ prompt: string; pendingFunctions: PendingFunctionConfig; imageDescriptionPrompt: string }> {
    try {
      const [prompt, pendingFunctions, imageDescriptionPrompt] = await Promise.all([
        this.getAgentPrompt(),
        this.getPendingFunctionsConfig(),
        this.getImageDescriptionPrompt(),
      ]);

      return {
        prompt,
        pendingFunctions,
        imageDescriptionPrompt,
      };
    } catch (error: any) {
      logger.error('Error getting all configs', { error: error.message });
      throw error;
    }
  }

  /**
   * Get function call prompt. O prompt é montado a partir da config (function_call_configs).
   */
  async getFunctionCallPrompt(toolName: string): Promise<string> {
    try {
      const config = await this.functionCallConfigService.getByFunctionCallName(toolName);
      if (!config) {
        logger.debug(`Function call config not found for ${toolName}`);
        return '';
      }
      return FunctionCallConfigService.buildPromptFromConfig(toolName, config);
    } catch (error: any) {
      logger.error('Error getting function call prompt', {
        error: error.message,
        toolName,
      });
      throw error;
    }
  }

  /**
   * Get all function call prompts. Lista vem de configs; prompts são montados a partir delas.
   */
  async getAllFunctionCallPrompts(): Promise<Record<string, string>> {
    try {
      const configs = await this.functionCallConfigService.getAll();
      const prompts: Record<string, string> = {};
      for (const config of configs) {
        const name = config.functionCallName;
        prompts[name] = FunctionCallConfigService.buildPromptFromConfig(name, config);
      }
      return prompts;
    } catch (error: any) {
      logger.error('Error getting all function call prompts', { error: error.message });
      return {};
    }
  }

  /**
   * Update function call prompt
   */
  async updateFunctionCallPrompt(toolName: string, prompt: string): Promise<AIConfig> {
    try {
      const key = `function_call_${toolName}`;
      
      let config = await this.configRepository.findOne({
        where: { key },
      });

      if (!config) {
        config = this.configRepository.create({
          key,
          value: prompt,
          metadata: {
            version: '1.0',
            description: `Prompt da function call ${toolName}`,
            toolName,
            updatedAt: new Date().toISOString(),
          },
        });
        
        // Auto-create function call config when prompt is created
        try {
          await this.functionCallConfigService.createConfigForFunctionCall(toolName);
        } catch (error: any) {
          logger.warn('Failed to auto-create function call config', {
            error: error.message,
            toolName,
          });
        }
      } else {
        config.value = prompt;
        config.metadata = {
          ...(config.metadata || {}),
          updatedAt: new Date().toISOString(),
        };
      }

      return await this.configRepository.save(config);
    } catch (error: any) {
      logger.error('Error updating function call prompt', {
        error: error.message,
        toolName,
      });
      throw error;
    }
  }

  /**
   * Get default function call prompt (from Python defaults)
   * This is a reference - actual defaults are in ai-worker/tools/default_prompts.py
   */
  async getDefaultFunctionCallPrompt(toolName: string): Promise<string> {
    // Default prompts are defined in Python file
    // This method is for reference/documentation
    // The AI Worker will load from default_prompts.py
    logger.debug(`Default prompt for ${toolName} is in ai-worker/tools/default_prompts.py`);
    return '';
  }

  /**
   * Delete function call prompt and all related data
   */
  async deleteFunctionCallPrompt(toolName: string): Promise<void> {
    try {
      const key = `function_call_${toolName}`;
      
      // Check if function call config exists (this is the main record)
      const functionCallConfig = await this.functionCallConfigService.getByFunctionCallName(toolName);
      const functionCallConfigExists = functionCallConfig !== null;

      // Check if prompt exists in ai_config
      const config = await this.configRepository.findOne({
        where: { key },
      });

      // If neither prompt nor config exists, still proceed with cleanup but log a warning
      if (!config && !functionCallConfigExists) {
        logger.warn('Function call not found in database, but proceeding with cleanup of references', {
          toolName,
        });
        // Continue with cleanup to remove any remaining references from agents/configs
      }

      // Remove references from specialist agents
      try {
        const specialists = await this.specialistAgentRepository.find();
        let updatedCount = 0;
        for (const specialist of specialists) {
          if (specialist.functionCallNames && Array.isArray(specialist.functionCallNames)) {
            const index = specialist.functionCallNames.indexOf(toolName);
            if (index !== -1) {
              specialist.functionCallNames = specialist.functionCallNames.filter(name => name !== toolName);
              await this.specialistAgentRepository.save(specialist);
              updatedCount++;
            }
          }
        }
        if (updatedCount > 0) {
          logger.info('Removed function call references from specialist agents', {
            toolName,
            agentsUpdated: updatedCount,
          });
        }
      } catch (specialistError: any) {
        logger.warn('Error removing references from specialist agents (non-critical)', {
          error: specialistError.message,
          toolName,
        });
      }

      // Remove references from multi-agent config (universal function calls)
      try {
        const multiAgentConfig = await this.multiAgentConfigRepository.findOne({
          where: {},
          order: { createdAt: 'DESC' },
        });
        if (multiAgentConfig && multiAgentConfig.universalFunctionCalls && Array.isArray(multiAgentConfig.universalFunctionCalls)) {
          const index = multiAgentConfig.universalFunctionCalls.indexOf(toolName);
          if (index !== -1) {
            multiAgentConfig.universalFunctionCalls = multiAgentConfig.universalFunctionCalls.filter(name => name !== toolName);
            await this.multiAgentConfigRepository.save(multiAgentConfig);
            logger.info('Removed function call reference from universal function calls', {
              toolName,
            });
          }
        }
      } catch (multiAgentError: any) {
        logger.warn('Error removing references from multi-agent config (non-critical)', {
          error: multiAgentError.message,
          toolName,
        });
      }

      // Delete all inputs for this function call (including inactive ones)
      try {
        const inputs = await this.functionCallInputService.getByFunctionCallName(toolName, true);
        for (const input of inputs) {
          await this.functionCallInputService.delete(input.id);
        }
        logger.info('Deleted all inputs for function call', {
          toolName,
          inputsDeleted: inputs.length,
        });
      } catch (inputError: any) {
        logger.warn('Error deleting inputs (non-critical)', {
          error: inputError.message,
          toolName,
        });
      }

      // Delete function call config
      if (functionCallConfigExists) {
        try {
          await this.functionCallConfigService.delete(toolName);
          logger.info('Deleted function call config', { toolName });
        } catch (configError: any) {
          logger.warn('Error deleting config (non-critical)', {
            error: configError.message,
            toolName,
          });
        }
      }

      // Delete the prompt itself (if it exists)
      if (config) {
        try {
          await this.configRepository.remove(config);
          logger.info('Function call prompt deleted from ai_config', {
            toolName,
          });
        } catch (promptError: any) {
          logger.warn('Error deleting prompt from ai_config (non-critical)', {
            error: promptError.message,
            toolName,
          });
        }
      }
      
      logger.info('Function call deletion process completed', {
        toolName,
        promptDeleted: !!config,
        configDeleted: functionCallConfigExists,
        userId: (global as any).currentUserId,
      });
    } catch (error: any) {
      logger.error('Error deleting function call prompt', {
        error: error.message,
        stack: error.stack,
        toolName,
      });
      throw error;
    }
  }

  /**
   * Get message buffer configuration
   */
  async getBufferConfig(): Promise<{ enabled: boolean; bufferTimeMs: number }> {
    try {
      const config = await this.configRepository.findOne({
        where: { key: 'message_buffer_config' },
      });

      if (!config || !config.value) {
        // Return default configuration
        return {
          enabled: false,
          bufferTimeMs: 5000,
        };
      }

      return JSON.parse(config.value);
    } catch (error: any) {
      logger.error('Error getting buffer config', { error: error.message });
      throw error;
    }
  }

  /**
   * Update message buffer configuration
   */
  async updateBufferConfig(bufferConfig: {
    enabled: boolean;
    bufferTimeMs: number;
  }): Promise<{ enabled: boolean; bufferTimeMs: number; updatedAt: Date }> {
    try {
      let config = await this.configRepository.findOne({
        where: { key: 'message_buffer_config' },
      });

      const configValue = {
        enabled: bufferConfig.enabled,
        bufferTimeMs: bufferConfig.bufferTimeMs,
      };

      if (!config) {
        config = this.configRepository.create({
          key: 'message_buffer_config',
          value: JSON.stringify(configValue),
          metadata: {
            version: '1.0',
            description: 'Configuração do buffer inteligente de mensagens',
            updatedAt: new Date().toISOString(),
          },
        });
      } else {
        config.value = JSON.stringify(configValue);
        config.metadata = {
          ...(config.metadata || {}),
          updatedAt: new Date().toISOString(),
        };
      }

      const saved = await this.configRepository.save(config);

      logger.info('Buffer configuration updated', {
        enabled: bufferConfig.enabled,
        bufferTimeMs: bufferConfig.bufferTimeMs,
        updatedAt: saved.updatedAt,
      });

      return {
        enabled: bufferConfig.enabled,
        bufferTimeMs: bufferConfig.bufferTimeMs,
        updatedAt: saved.updatedAt,
      };
    } catch (error: any) {
      logger.error('Error updating buffer config', { error: error.message });
      throw error;
    }
  }

  /**
   * Get agent temperature (0 = mais assertivo, 2 = mais criativo/avoado)
   */
  async getAgentTemperature(): Promise<number> {
    try {
      const config = await this.configRepository.findOne({
        where: { key: 'agent_temperature' },
      });

      if (!config || !config.value || config.value.trim() === '') {
        return 0.7;
      }

      const value = parseFloat(config.value);
      if (Number.isNaN(value) || value < 0 || value > 2) {
        return 0.7;
      }
      return value;
    } catch (error: any) {
      logger.error('Error getting agent temperature', { error: error.message });
      return 0.7;
    }
  }

  /**
   * Update agent temperature
   */
  async updateAgentTemperature(temperature: number): Promise<{ temperature: number; updatedAt: Date }> {
    try {
      const clamped = Math.max(0, Math.min(2, temperature));
      let config = await this.configRepository.findOne({
        where: { key: 'agent_temperature' },
      });

      if (!config) {
        config = this.configRepository.create({
          key: 'agent_temperature',
          value: String(clamped),
          metadata: {
            version: '1.0',
            description: 'Temperatura do agente (0 = assertivo, 2 = criativo)',
            updatedAt: new Date().toISOString(),
          },
        });
      } else {
        config.value = String(clamped);
        config.metadata = {
          ...(config.metadata || {}),
          updatedAt: new Date().toISOString(),
        };
      }

      const saved = await this.configRepository.save(config);
      logger.info('Agent temperature updated', { temperature: clamped, updatedAt: saved.updatedAt });
      return { temperature: clamped, updatedAt: saved.updatedAt };
    } catch (error: any) {
      logger.error('Error updating agent temperature', { error: error.message });
      throw error;
    }
  }

  /** Normaliza número para comparação (apenas dígitos). */
  private static normalizePhone(phone: string): string {
    return (phone || '').replace(/\D/g, '');
  }

  /**
   * Config da blacklist: números que não são respondidos pela IA e não aparecem como atendimentos.
   */
  async getBlacklistConfig(): Promise<{ enabled: boolean; numbers: string[] }> {
    try {
      const config = await this.configRepository.findOne({
        where: { key: 'blacklist_config' },
      });
      if (!config || !config.value || config.value.trim() === '') {
        return { enabled: false, numbers: [] };
      }
      const parsed = JSON.parse(config.value) as { enabled?: boolean; numbers?: string[] };
      return {
        enabled: parsed.enabled === true,
        numbers: Array.isArray(parsed.numbers) ? parsed.numbers.map((n) => String(n).replace(/\D/g, '')).filter(Boolean) : [],
      };
    } catch (error: any) {
      logger.error('Error getting blacklist config', { error: error.message });
      return { enabled: false, numbers: [] };
    }
  }

  async updateBlacklistConfig(data: { enabled: boolean; numbers: string[] }): Promise<{ enabled: boolean; numbers: string[] }> {
    try {
      const numbers = (data.numbers || [])
        .map((n) => String(n).trim().replace(/\D/g, ''))
        .filter(Boolean);
      const normalized = { enabled: !!data.enabled, numbers: [...new Set(numbers)] };
      let config = await this.configRepository.findOne({
        where: { key: 'blacklist_config' },
      });
      if (!config) {
        config = this.configRepository.create({
          key: 'blacklist_config',
          value: JSON.stringify(normalized),
          metadata: { updatedAt: new Date().toISOString() },
        });
      } else {
        config.value = JSON.stringify(normalized);
        config.metadata = { ...(config.metadata || {}), updatedAt: new Date().toISOString() };
      }
      await this.configRepository.save(config);
      logger.info('Blacklist config updated', { enabled: normalized.enabled, count: normalized.numbers.length });
      return normalized;
    } catch (error: any) {
      logger.error('Error updating blacklist config', { error: error.message });
      throw error;
    }
  }

  /** Retorna Set de números blacklistados (apenas dígitos) ou null se blacklist desativada. */
  async getBlacklistedPhonesSet(): Promise<Set<string> | null> {
    const { enabled, numbers } = await this.getBlacklistConfig();
    if (!enabled || numbers.length === 0) return null;
    return new Set(numbers.map((n) => AIConfigService.normalizePhone(n)).filter(Boolean));
  }

  /** Verifica se o número está na blacklist (blacklist ativa e número na lista). */
  async isPhoneBlacklisted(phone: string): Promise<boolean> {
    const set = await this.getBlacklistedPhonesSet();
    if (!set) return false;
    return set.has(AIConfigService.normalizePhone(phone));
  }

  /**
   * Get AI module enabled state (worker consumes RabbitMQ when true)
   */
  async getAIModuleEnabled(): Promise<boolean> {
    try {
      const config = await this.configRepository.findOne({
        where: { key: 'ai_enabled' },
      });
      if (!config || !config.value || config.value.trim() === '') return true;
      const v = config.value.trim().toLowerCase();
      return v === 'true' || v === '1' || v === 'yes';
    } catch (error: any) {
      logger.error('Error getting AI enabled', { error: error.message });
      return true;
    }
  }

  /**
   * Update AI module enabled state
   */
  async updateAIModuleEnabled(enabled: boolean): Promise<{ enabled: boolean; updatedAt: Date }> {
    try {
      let config = await this.configRepository.findOne({
        where: { key: 'ai_enabled' },
      });
      const value = enabled ? 'true' : 'false';
      if (!config) {
        config = this.configRepository.create({
          key: 'ai_enabled',
          value,
          metadata: {
            version: '1.0',
            description: 'IA ligada (consome fila) ou desligada (pausa consumo)',
            updatedAt: new Date().toISOString(),
          },
        });
      } else {
        config.value = value;
        config.metadata = { ...(config.metadata || {}), updatedAt: new Date().toISOString() };
      }
      const saved = await this.configRepository.save(config);
      logger.info('AI module enabled updated', { enabled, updatedAt: saved.updatedAt });
      return { enabled, updatedAt: saved.updatedAt };
    } catch (error: any) {
      logger.error('Error updating AI enabled', { error: error.message });
      throw error;
    }
  }

  /**
   * Get OpenAI model from ai_config (key openai_model). Fallback null = use env.
   */
  async getOpenAIModel(): Promise<string | null> {
    try {
      const config = await this.configRepository.findOne({
        where: { key: 'openai_model' },
      });
      if (!config || !config.value || !config.value.trim()) return null;
      return config.value.trim();
    } catch (error: any) {
      logger.error('Error getting OpenAI model', { error: error.message });
      return null;
    }
  }

  /**
   * Update OpenAI model in ai_config.
   */
  async updateOpenAIModel(model: string): Promise<{ model: string; updatedAt: Date }> {
    try {
      const s = String(model).trim();
      if (!s) throw new Error('model is required');
      let config = await this.configRepository.findOne({
        where: { key: 'openai_model' },
      });
      if (!config) {
        config = this.configRepository.create({
          key: 'openai_model',
          value: s,
          metadata: {
            version: '1.0',
            description: 'Modelo OpenAI usado pelo agente',
            updatedAt: new Date().toISOString(),
          },
        });
      } else {
        config.value = s;
        config.metadata = { ...(config.metadata || {}), updatedAt: new Date().toISOString() };
      }
      const saved = await this.configRepository.save(config);
      logger.info('OpenAI model updated', { model: s, updatedAt: saved.updatedAt });
      return { model: s, updatedAt: saved.updatedAt };
    } catch (error: any) {
      logger.error('Error updating OpenAI model', { error: error.message });
      throw error;
    }
  }

  /**
   * Get auto-reopen timeout configuration (time in minutes after closing to auto-reopen)
   * Default: 60 minutes (1 hour)
   * Range: 1 minute to 480 minutes (8 hours)
   */
  async getAutoReopenTimeout(): Promise<number> {
    try {
      const config = await this.configRepository.findOne({
        where: { key: 'auto_reopen_timeout_minutes' },
      });

      if (!config || !config.value || config.value.trim() === '') {
        return 60; // Default: 1 hour
      }

      const value = parseInt(config.value, 10);
      if (Number.isNaN(value) || value < 1 || value > 480) {
        return 60; // Default if invalid
      }
      return value;
    } catch (error: any) {
      logger.error('Error getting auto-reopen timeout', { error: error.message });
      return 60; // Default on error
    }
  }

  /**
   * Update auto-reopen timeout configuration
   * @param timeoutMinutes Time in minutes (1 to 480)
   */
  /**
   * Get subdivision inactivity timeouts configuration
   * Returns a map of subdivision keys to timeout minutes (e.g., { 'triagem': 60, 'encaminhados-ecommerce': 30 })
   */
  async getSubdivisionInactivityTimeouts(): Promise<Record<string, number>> {
    try {
      const config = await this.configRepository.findOne({
        where: { key: 'subdivision_inactivity_timeouts' },
      });
      
      if (!config || !config.value) {
        return {}; // Retorna objeto vazio se não configurado
      }
      
      try {
        const timeouts = typeof config.value === 'string' 
          ? JSON.parse(config.value) 
          : config.value;
        
        if (typeof timeouts !== 'object' || timeouts === null) {
          return {};
        }
        
        // Filtrar valores inválidos (null, undefined, vazios, ou fora do range)
        const filtered: Record<string, number> = {};
        for (const [key, value] of Object.entries(timeouts)) {
          if (typeof value === 'number' && value >= 1 && value <= 1440) {
            filtered[key] = value;
          }
        }
        
        return filtered;
      } catch (parseError: any) {
        logger.warn('Error parsing subdivision_inactivity_timeouts', { 
          error: parseError?.message || parseError,
          stack: parseError?.stack,
        });
        return {};
      }
    } catch (error: any) {
      logger.error('Error getting subdivision inactivity timeouts', { error: error.message });
      return {};
    }
  }

  /**
   * Update subdivision inactivity timeouts configuration
   * @param timeouts Map of subdivision keys to timeout minutes (e.g., { 'triagem': 60, 'encaminhados-ecommerce': 30 })
   */
  async updateSubdivisionInactivityTimeouts(timeouts: Record<string, number>): Promise<{ timeouts: Record<string, number>; updatedAt: Date }> {
    try {
      // Validar que todos os valores são números positivos
      for (const [key, value] of Object.entries(timeouts)) {
        if (typeof value !== 'number' || value < 1 || value > 1440) {
          throw new Error(`Invalid timeout for subdivision '${key}': must be between 1 and 1440 minutes (24 hours)`);
        }
      }
      
      let config = await this.configRepository.findOne({
        where: { key: 'subdivision_inactivity_timeouts' },
      });
      
      const timeoutsJson = JSON.stringify(timeouts);
      
      if (!config) {
        config = this.configRepository.create({
          key: 'subdivision_inactivity_timeouts',
          value: timeoutsJson,
          metadata: {
            version: '1.0',
            description: 'Tempos de inatividade por subdivisão (em minutos) para fechamento automático',
            updatedAt: new Date().toISOString(),
          },
        });
      } else {
        config.value = timeoutsJson;
        config.metadata = {
          ...(config.metadata || {}),
          updatedAt: new Date().toISOString(),
        };
      }
      
      const saved = await this.configRepository.save(config);
      logger.info('Subdivision inactivity timeouts updated', { 
        subdivisions: Object.keys(timeouts),
        updatedAt: saved.updatedAt 
      });
      
      return { timeouts, updatedAt: saved.updatedAt };
    } catch (error: any) {
      logger.error('Error updating subdivision inactivity timeouts', { error: error.message });
      throw error;
    }
  }

  private static readonly DIVISION_UI_HEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

  /**
   * Personalização global de nomes e cores (barra Entrada do supervisor).
   * Chave = identificador estável (ex.: abertos, triagem, pedidos-orcamentos).
   */
  async getDivisionSubdivisionUi(): Promise<Record<string, { label?: string; color?: string; accentColor?: string }>> {
    const re = AIConfigService.DIVISION_UI_HEX;
    try {
      const config = await this.configRepository.findOne({
        where: { key: 'division_subdivision_ui' },
      });
      if (!config?.value) return {};
      const raw = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
      if (!raw || typeof raw !== 'object') return {};
      const out: Record<string, { label?: string; color?: string; accentColor?: string }> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (!v || typeof v !== 'object') continue;
        const o = v as Record<string, unknown>;
        const entry: { label?: string; color?: string; accentColor?: string } = {};
        if (typeof o.label === 'string' && o.label.trim()) entry.label = o.label.trim().slice(0, 80);
        if (typeof o.color === 'string' && re.test(o.color.trim())) entry.color = o.color.trim();
        if (typeof o.accentColor === 'string' && re.test(o.accentColor.trim())) entry.accentColor = o.accentColor.trim();
        if (Object.keys(entry).length) out[k] = entry;
      }
      return out;
    } catch (error: any) {
      logger.error('Error getting division_subdivision_ui', { error: error.message });
      return {};
    }
  }

  async mergeDivisionSubdivisionUi(
    patch: Record<string, { label?: string; color?: string; accentColor?: string } | null>
  ): Promise<{ entries: Record<string, { label?: string; color?: string; accentColor?: string }>; updatedAt: Date }> {
    const re = AIConfigService.DIVISION_UI_HEX;
    const existing = await this.getDivisionSubdivisionUi();
    const next = { ...existing };

    for (const [key, val] of Object.entries(patch)) {
      if (val === null) {
        delete next[key];
        continue;
      }
      if (!val || typeof val !== 'object') continue;

      const entry: { label?: string; color?: string; accentColor?: string } = {};
      if (val.label != null && String(val.label).trim()) entry.label = String(val.label).trim().slice(0, 80);
      if (val.color != null && String(val.color).trim()) {
        const c = String(val.color).trim();
        if (!re.test(c)) {
          throw new Error(`Cor principal inválida para "${key}" (use #RGB ou #RRGGBB)`);
        }
        entry.color = c;
      }
      if (val.accentColor != null && String(val.accentColor).trim()) {
        const c = String(val.accentColor).trim();
        if (!re.test(c)) {
          throw new Error(`Cor de destaque inválida para "${key}" (use #RGB ou #RRGGBB)`);
        }
        entry.accentColor = c;
      }

      if (Object.keys(entry).length === 0) delete next[key];
      else next[key] = entry;
    }

    const json = JSON.stringify(next);
    let entity = await this.configRepository.findOne({
      where: { key: 'division_subdivision_ui' },
    });
    if (!entity) {
      entity = this.configRepository.create({
        key: 'division_subdivision_ui',
        value: json,
        metadata: { updatedAt: new Date().toISOString() },
      });
    } else {
      entity.value = json;
      entity.metadata = { ...(entity.metadata || {}), updatedAt: new Date().toISOString() };
    }
    const saved = await this.configRepository.save(entity);
    logger.info('division_subdivision_ui merged', { keys: Object.keys(patch) });
    return { entries: next, updatedAt: saved.updatedAt };
  }

  private static readonly SUPERVISOR_SIDEBAR_CUSTOM_TARGETS = new Set<string>([
    'abertos',
    'nao-atribuidos-todos',
    'nao-atribuidos-triagem',
    'nao-atribuidos-encaminhados-ecommerce',
    'nao-atribuidos-encaminhados-balcao',
    'intervencao-humana-root',
    'service-PROTESE_CAPILAR',
    'service-MANUTENCAO',
    'service-OUTROS_ASSUNTOS',
    'follow-up-root',
    'follow-up-inativo-1h',
    'follow-up-inativo-12h',
    'follow-up-inativo-24h',
    'fechados',
    'demandas-all',
    'demanda-pedidos-orcamentos',
    'demanda-perguntas-pos-orcamento',
    'demanda-confirmacao-pix',
    'demanda-tirar-pedido',
    'demanda-informacoes-entrega',
    'demanda-encomendas',
    'demanda-cliente-pediu-humano',
  ]);

  private static readonly SUPERVISOR_SIDEBAR_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
  private static readonly SUPERVISOR_SIDEBAR_ICON_RE = /^[a-z0-9_]{1,48}$/i;

  /** Atalhos hierárquicos na barra Entrada (supervisor): labels ícones alvo — persistido em JSON */
  async getSupervisorSidebarCustom(): Promise<{
    nodes: Array<{ id: string; label: string; icon?: string; parentId: string | null; order: number; targetId: string }>;
  }> {
    try {
      const config = await this.configRepository.findOne({
        where: { key: 'supervisor_sidebar_custom' },
      });
      if (!config?.value) return { nodes: [] };
      const raw = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
      const nodes = raw?.nodes;
      if (!Array.isArray(nodes)) return { nodes: [] };
      const out: Array<{ id: string; label: string; icon?: string; parentId: string | null; order: number; targetId: string }> = [];
      for (const item of nodes) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const id = typeof o.id === 'string' ? o.id.trim() : '';
        const label = typeof o.label === 'string' ? o.label.trim() : '';
        const targetId = typeof o.targetId === 'string' ? o.targetId.trim() : '';
        if (!AIConfigService.SUPERVISOR_SIDEBAR_ID_RE.test(id)) continue;
        if (!label || label.length > 80) continue;
        if (!AIConfigService.SUPERVISOR_SIDEBAR_CUSTOM_TARGETS.has(targetId)) continue;
        let parentId: string | null = null;
        if (o.parentId != null) {
          if (typeof o.parentId !== 'string' || !AIConfigService.SUPERVISOR_SIDEBAR_ID_RE.test(o.parentId)) continue;
          parentId = o.parentId;
        }
        let order = typeof o.order === 'number' && Number.isFinite(o.order) ? Math.floor(o.order) : 0;
        order = Math.max(0, Math.min(9999, order));
        const entry: { id: string; label: string; icon?: string; parentId: string | null; order: number; targetId: string } = {
          id,
          label: label.slice(0, 80),
          parentId,
          order,
          targetId,
        };
        if (typeof o.icon === 'string' && o.icon.trim()) {
          const ic = o.icon.trim();
          if (AIConfigService.SUPERVISOR_SIDEBAR_ICON_RE.test(ic)) entry.icon = ic.slice(0, 48);
        }
        out.push(entry);
      }
      const idSet = new Set(out.map((n) => n.id));
      const filtered = out.filter((n) => !n.parentId || idSet.has(n.parentId));
      filtered.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
      return { nodes: filtered.slice(0, 60) };
    } catch (error: any) {
      logger.error('Error getting supervisor_sidebar_custom', { error: error.message });
      return { nodes: [] };
    }
  }

  async replaceSupervisorSidebarCustom(nodes: unknown): Promise<{
    nodes: Array<{ id: string; label: string; icon?: string; parentId: string | null; order: number; targetId: string }>;
    updatedAt: Date;
  }> {
    if (!Array.isArray(nodes)) {
      throw new Error('nodes deve ser um array');
    }
    if (nodes.length > 60) {
      throw new Error('No máximo 60 atalhos permitidos');
    }
    const normalized: Array<{ id: string; label: string; icon?: string; parentId: string | null; order: number; targetId: string }> = [];
    for (let i = 0; i < nodes.length; i++) {
      const item = nodes[i];
      if (!item || typeof item !== 'object') throw new Error(`Item ${i} inválido`);
      const o = item as Record<string, unknown>;
      const id = typeof o.id === 'string' ? o.id.trim() : '';
      const label = typeof o.label === 'string' ? o.label.trim() : '';
      const targetId = typeof o.targetId === 'string' ? o.targetId.trim() : '';
      if (!AIConfigService.SUPERVISOR_SIDEBAR_ID_RE.test(id)) {
        throw new Error(`ID inválido no item ${i}`);
      }
      if (!label || label.length > 80) {
        throw new Error(`Label inválido no item ${i}`);
      }
      if (!AIConfigService.SUPERVISOR_SIDEBAR_CUSTOM_TARGETS.has(targetId)) {
        throw new Error(`Destino (targetId) inválido no item ${i}`);
      }
      let parentId: string | null = null;
      if (o.parentId != null) {
        if (typeof o.parentId !== 'string' || !AIConfigService.SUPERVISOR_SIDEBAR_ID_RE.test(o.parentId)) {
          throw new Error(`parentId inválido no item ${i}`);
        }
        parentId = o.parentId;
      }
      let order = typeof o.order === 'number' && Number.isFinite(o.order) ? Math.floor(o.order) : 0;
      order = Math.max(0, Math.min(9999, order));
      const entry: { id: string; label: string; icon?: string; parentId: string | null; order: number; targetId: string } = {
        id,
        label: label.slice(0, 80),
        parentId,
        order,
        targetId,
      };
      if (typeof o.icon === 'string' && o.icon.trim()) {
        const ic = o.icon.trim();
        if (!AIConfigService.SUPERVISOR_SIDEBAR_ICON_RE.test(ic)) {
          throw new Error(`Ícone inválido no item ${i} (use nome Material Icons, ex.: folder)`);
        }
        entry.icon = ic.slice(0, 48);
      }
      normalized.push(entry);
    }
    const idSet = new Set(normalized.map((n) => n.id));
    if (idSet.size !== normalized.length) {
      throw new Error('IDs duplicados');
    }
    for (const n of normalized) {
      if (n.parentId === n.id) throw new Error('Um item não pode ser pai de si mesmo');
      if (n.parentId && !idSet.has(n.parentId)) throw new Error(`parentId inexistente: ${n.parentId}`);
    }
    for (const n of normalized) {
      const seen = new Set<string>();
      let cur: string | null = n.parentId;
      let depth = 0;
      while (cur) {
        depth++;
        if (depth > 24 || seen.has(cur)) throw new Error('Ciclo ou hierarquia inválida nos atalhos');
        seen.add(cur);
        const p = normalized.find((x) => x.id === cur);
        cur = p?.parentId ?? null;
      }
    }
    normalized.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    const json = JSON.stringify({ nodes: normalized });
    let entity = await this.configRepository.findOne({
      where: { key: 'supervisor_sidebar_custom' },
    });
    if (!entity) {
      entity = this.configRepository.create({
        key: 'supervisor_sidebar_custom',
        value: json,
        metadata: { updatedAt: new Date().toISOString() },
      });
    } else {
      entity.value = json;
      entity.metadata = { ...(entity.metadata || {}), updatedAt: new Date().toISOString() };
    }
    const saved = await this.configRepository.save(entity);
    logger.info('supervisor_sidebar_custom replaced', { count: normalized.length });
    return { nodes: normalized, updatedAt: saved.updatedAt };
  }

  /**
   * Get follow-up configuration (times and messages for inactive attendances)
   */
  async getFollowUpConfig(): Promise<{
    firstDelayMinutes: number;
    secondDelayMinutes: number;
    closeDelayMinutes: number;
    firstMessage: string;
    secondMessage: string;
    firstFollowUpEnabled: boolean;
    secondFollowUpEnabled: boolean;
    autoCloseAfterFollowUpEnabled: boolean;
  }> {
    const defaults = {
      firstDelayMinutes: 60,
      secondDelayMinutes: 1440,
      closeDelayMinutes: 2160,
      firstMessage: 'Oi! Passando para saber se você ainda precisa de ajuda. Se quiser, eu continuo seu atendimento por aqui.',
      secondMessage: 'Ainda não tivemos seu retorno. Quando quiser retomar, é só responder esta mensagem que seguimos com o atendimento.',
      firstFollowUpEnabled: true,
      secondFollowUpEnabled: true,
      autoCloseAfterFollowUpEnabled: true,
    };
    try {
      const config = await this.configRepository.findOne({
        where: { key: 'follow_up_config' },
      });
      if (!config || !config.value) {
        return defaults;
      }
      const parsed = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
      return {
        firstDelayMinutes: Math.max(1, Math.min(1440, parsed.firstDelayMinutes ?? 60)),
        secondDelayMinutes: Math.max(1, Math.min(1440 * 7, parsed.secondDelayMinutes ?? 1440)),
        closeDelayMinutes: Math.max(60, Math.min(1440 * 30, parsed.closeDelayMinutes ?? 2160)),
        firstMessage: typeof parsed.firstMessage === 'string' ? parsed.firstMessage : defaults.firstMessage,
        secondMessage: typeof parsed.secondMessage === 'string' ? parsed.secondMessage : defaults.secondMessage,
        firstFollowUpEnabled: parsed.firstFollowUpEnabled !== false,
        secondFollowUpEnabled: parsed.secondFollowUpEnabled !== false,
        autoCloseAfterFollowUpEnabled: parsed.autoCloseAfterFollowUpEnabled !== false,
      };
    } catch (error: any) {
      logger.error('Error getting follow-up config', { error: error.message });
      return defaults;
    }
  }

  /**
   * Update follow-up configuration
   */
  async updateFollowUpConfig(config: {
    firstDelayMinutes: number;
    secondDelayMinutes: number;
    closeDelayMinutes: number;
    firstMessage: string;
    secondMessage: string;
    firstFollowUpEnabled?: boolean;
    secondFollowUpEnabled?: boolean;
    autoCloseAfterFollowUpEnabled?: boolean;
  }): Promise<{ success: boolean; updatedAt: Date }> {
    try {
      let firstFollowUpEnabled = config.firstFollowUpEnabled !== false;
      let secondFollowUpEnabled = config.secondFollowUpEnabled !== false;
      if (!firstFollowUpEnabled) {
        secondFollowUpEnabled = false;
      }
      const autoCloseAfterFollowUpEnabled = config.autoCloseAfterFollowUpEnabled !== false;

      if (firstFollowUpEnabled && (config.firstDelayMinutes < 1 || config.firstDelayMinutes > 1440)) {
        throw new Error('Tempo até 1ª mensagem deve estar entre 1 e 1440 minutos (24h)');
      }
      if (secondFollowUpEnabled && (config.secondDelayMinutes < 1 || config.secondDelayMinutes > 1440 * 7)) {
        throw new Error('Tempo até 2ª mensagem deve estar entre 1 e 10080 minutos (7 dias)');
      }
      if (config.closeDelayMinutes < 60 || config.closeDelayMinutes > 1440 * 30) {
        throw new Error('Tempo até fechamento deve estar entre 60 e 43200 minutos (30 dias)');
      }
      if (firstFollowUpEnabled && !config.firstMessage?.trim()) {
        throw new Error('Mensagem do 1º follow-up é obrigatória quando o 1º follow-up está ativo');
      }
      if (secondFollowUpEnabled && !config.secondMessage?.trim()) {
        throw new Error('Mensagem do 2º follow-up é obrigatória quando o 2º follow-up está ativo');
      }

      const payload = {
        firstDelayMinutes: config.firstDelayMinutes,
        secondDelayMinutes: config.secondDelayMinutes,
        closeDelayMinutes: config.closeDelayMinutes,
        firstMessage: config.firstMessage ?? '',
        secondMessage: config.secondMessage ?? '',
        firstFollowUpEnabled,
        secondFollowUpEnabled,
        autoCloseAfterFollowUpEnabled,
      };

      let entity = await this.configRepository.findOne({
        where: { key: 'follow_up_config' },
      });
      const value = JSON.stringify(payload);
      if (!entity) {
        entity = this.configRepository.create({
          key: 'follow_up_config',
          value,
          metadata: { updatedAt: new Date().toISOString() },
        });
      } else {
        entity.value = value;
        entity.metadata = { ...(entity.metadata || {}), updatedAt: new Date().toISOString() };
      }
      const saved = await this.configRepository.save(entity);
      logger.info('Follow-up config updated', { updatedAt: saved.updatedAt });
      return { success: true, updatedAt: saved.updatedAt };
    } catch (error: any) {
      logger.error('Error updating follow-up config', { error: error.message });
      throw error;
    }
  }

  /**
   * Get follow-up movement configuration (when to move attendances between divisions)
   * Separate from message sending times - controls column/status movement only.
   */
  async getFollowUpMovementConfig(): Promise<{
    moveOpenToFirstFollowUpMinutes: number;
    moveToFechadosAfterSecondFollowUpMinutes: number;
  }> {
    try {
      const config = await this.configRepository.findOne({
        where: { key: 'follow_up_movement_config' },
      });
      if (!config || !config.value) {
        return {
          moveOpenToFirstFollowUpMinutes: 60,
          moveToFechadosAfterSecondFollowUpMinutes: 1440,
        };
      }
      const parsed = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
      return {
        moveOpenToFirstFollowUpMinutes: Math.max(1, Math.min(1440, parsed.moveOpenToFirstFollowUpMinutes ?? 60)),
        moveToFechadosAfterSecondFollowUpMinutes: Math.max(60, Math.min(43200, parsed.moveToFechadosAfterSecondFollowUpMinutes ?? 1440)),
      };
    } catch (error: any) {
      logger.error('Error getting follow-up movement config', { error: error.message });
      return {
        moveOpenToFirstFollowUpMinutes: 60,
        moveToFechadosAfterSecondFollowUpMinutes: 1440,
      };
    }
  }

  /**
   * Update follow-up movement configuration
   */
  async updateFollowUpMovementConfig(config: {
    moveOpenToFirstFollowUpMinutes: number;
    moveToFechadosAfterSecondFollowUpMinutes: number;
  }): Promise<{ success: boolean; updatedAt: Date }> {
    try {
      if (config.moveOpenToFirstFollowUpMinutes < 1 || config.moveOpenToFirstFollowUpMinutes > 1440) {
        throw new Error('Tempo para mover de Abertos → Aguardando 1º deve estar entre 1 e 1440 minutos');
      }
      if (config.moveToFechadosAfterSecondFollowUpMinutes < 60 || config.moveToFechadosAfterSecondFollowUpMinutes > 43200) {
        throw new Error('Tempo após 2º follow-up para Fechados deve estar entre 60 e 43200 minutos');
      }
      let entity = await this.configRepository.findOne({
        where: { key: 'follow_up_movement_config' },
      });
      const value = JSON.stringify(config);
      if (!entity) {
        entity = this.configRepository.create({
          key: 'follow_up_movement_config',
          value,
          metadata: { updatedAt: new Date().toISOString() },
        });
      } else {
        entity.value = value;
        entity.metadata = { ...(entity.metadata || {}), updatedAt: new Date().toISOString() };
      }
      const saved = await this.configRepository.save(entity);
      logger.info('Follow-up movement config updated', { updatedAt: saved.updatedAt });
      return { success: true, updatedAt: saved.updatedAt };
    } catch (error: any) {
      logger.error('Error updating follow-up movement config', { error: error.message });
      throw error;
    }
  }

  /**
   * Get follow-up global enabled flag.
   * Default: true (feature enabled).
   */
  async getFollowUpEnabled(): Promise<boolean> {
    try {
      const config = await this.configRepository.findOne({
        where: { key: 'follow_up_enabled' },
      });
      if (!config || !config.value || config.value.trim() === '') return true;
      const v = config.value.trim().toLowerCase();
      return v !== 'false' && v !== '0' && v !== 'no';
    } catch (error: any) {
      logger.error('Error getting follow_up_enabled', { error: error.message });
      return true;
    }
  }

  /**
   * Update follow-up global enabled flag.
   */
  async updateFollowUpEnabled(enabled: boolean): Promise<{ enabled: boolean; updatedAt: Date }> {
    try {
      let config = await this.configRepository.findOne({
        where: { key: 'follow_up_enabled' },
      });
      const value = enabled ? 'true' : 'false';
      if (!config) {
        config = this.configRepository.create({
          key: 'follow_up_enabled',
          value,
          metadata: {
            version: '1.0',
            description: 'Liga/desliga completamente o sistema de follow-up automático',
            updatedAt: new Date().toISOString(),
          },
        });
      } else {
        config.value = value;
        config.metadata = { ...(config.metadata || {}), updatedAt: new Date().toISOString() };
      }
      const saved = await this.configRepository.save(config);
      logger.info('follow_up_enabled updated', { enabled, updatedAt: saved.updatedAt });
      return { enabled, updatedAt: saved.updatedAt };
    } catch (error: any) {
      logger.error('Error updating follow_up_enabled', { error: error.message });
      throw error;
    }
  }

  async updateAutoReopenTimeout(timeoutMinutes: number): Promise<{ timeoutMinutes: number; updatedAt: Date }> {
    try {
      const clamped = Math.max(1, Math.min(480, timeoutMinutes)); // Clamp between 1 and 480 minutes
      let config = await this.configRepository.findOne({
        where: { key: 'auto_reopen_timeout_minutes' },
      });

      if (!config) {
        config = this.configRepository.create({
          key: 'auto_reopen_timeout_minutes',
          value: String(clamped),
          metadata: {
            version: '1.0',
            description: 'Tempo em minutos após fechamento para reabertura automática de atendimentos',
            updatedAt: new Date().toISOString(),
          },
        });
      } else {
        config.value = String(clamped);
        config.metadata = {
          ...(config.metadata || {}),
          updatedAt: new Date().toISOString(),
        };
      }

      const saved = await this.configRepository.save(config);

      logger.info('Auto-reopen timeout configuration updated', {
        timeoutMinutes: clamped,
        updatedAt: saved.updatedAt,
      });

      return {
        timeoutMinutes: clamped,
        updatedAt: saved.updatedAt,
      };
    } catch (error: any) {
      logger.error('Error updating auto-reopen timeout', { error: error.message });
      throw error;
    }
  }
}

export const aiConfigService = new AIConfigService();