// @ts-nocheck
import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { FunctionCallConfig, ProcessingMethod } from '../../domain/entities/function-call-config.entity';
import { logger } from '../../../../shared/utils/logger';

export interface UpdateFunctionCallConfigDto {
  hasOutput?: boolean;
  isSync?: boolean;
  processingMethod?: ProcessingMethod;
  isActive?: boolean;
  metadata?: Record<string, any>;
  triggerConditions?: string;
  executionTiming?: string;
  objective?: string;
  requiredFields?: string[];
  optionalFields?: string[];
  restrictions?: string;
  processingNotes?: string;
  customAttributes?: Record<string, unknown>;
  /** ID do processo vinculado (acionador): ao executar esta FC, o processo também é executado. */
  processId?: string | null;
}

export class FunctionCallConfigService {
  private get configRepository() {
    return AppDataSource.getRepository(FunctionCallConfig);
  }

  /**
   * Monta o prompt da function call a partir dos campos da config.
   * Usado pelo backend e pelo AI Worker (Python) para substituir o prompt livre.
   */
  static buildPromptFromConfig(toolName: string, config: Partial<FunctionCallConfig>): string {
    const parts: string[] = [`<Function name="${toolName}">`];
    const trigger = (config.triggerConditions ?? '').trim();
    if (trigger) {
      parts.push('  <QuandoUsar>', `    ${trigger}`, '  </QuandoUsar>');
    }
    const obj = (config.objective ?? '').trim();
    if (obj) {
      parts.push('  <Objetivo>', `    ${obj}`, '  </Objetivo>');
    }
    const req = config.requiredFields ?? [];
    const reqArr = Array.isArray(req) ? req : (typeof req === 'string' ? req.split(',').map(s => s.trim()).filter(Boolean) : []);
    if (reqArr.length) {
      parts.push('  <DadosObrigatorios>');
      reqArr.forEach(f => parts.push(`    <Item>${f}</Item>`));
      parts.push('  </DadosObrigatorios>');
    }
    const opt = config.optionalFields ?? [];
    const optArr = Array.isArray(opt) ? opt : (typeof opt === 'string' ? opt.split(',').map(s => s.trim()).filter(Boolean) : []);
    if (optArr.length) {
      parts.push('  <DadosOpcionais>');
      optArr.forEach(f => parts.push(`    <Item>${f}</Item>`));
      parts.push('  </DadosOpcionais>');
    }
    const timing = (config.executionTiming ?? '').trim();
    if (timing) {
      parts.push('  <MomentoDeExecucao>', `    ${timing}`, '  </MomentoDeExecucao>');
    }
    const restr = (config.restrictions ?? '').trim();
    if (restr) {
      parts.push('  <Restricoes>');
      restr.split('\n').forEach(line => {
        const t = line.trim();
        if (t) parts.push(`    <Item>${t}</Item>`);
      });
      parts.push('  </Restricoes>');
    }
    const allFields = [...reqArr, ...optArr];
    if (allFields.length) {
      const fieldsStr = allFields.join(', ');
      parts.push(
        '  <InvocacaoDaFerramenta>',
        `    Ao acionar esta ferramenta, envie no argumento "data" um JSON com as chaves: ${fieldsStr}. Preencha com os dados extraídos da conversa. Nunca invoque com "data" vazio.`,
        '  </InvocacaoDaFerramenta>'
      );
    }
    parts.push('</Function>');
    return parts.join('\n');
  }

  /**
   * Verifica se a config tem conteúdo suficiente para considerar a FC "configurada"
   * (ex.: para permitir ativar).
   */
  static isConfigMeaningful(config: Partial<FunctionCallConfig>): boolean {
    const hasText = (s?: string) => typeof s === 'string' && s.trim().length > 0;
    const req = config.requiredFields ?? [];
    const reqLen = Array.isArray(req) ? req.length : 0;
    return hasText(config.objective) || hasText(config.triggerConditions) || reqLen > 0;
  }

  /**
   * Get config by function call name
   */
  async getByFunctionCallName(functionCallName: string): Promise<FunctionCallConfig | null> {
    try {
      // Check if is_active column exists
      const queryRunner = this.configRepository.manager.connection.createQueryRunner();
      const table = await queryRunner.getTable('function_call_configs');
      const hasIsActiveColumn = table?.columns.some(col => col.name === 'is_active');
      await queryRunner.release();

      let result: any;
      if (hasIsActiveColumn) {
        // Column exists, use normal query
        const config = await this.configRepository.findOne({
          where: { functionCallName },
        });
        if (!config) return null;
        return {
          ...config,
          isActive: (config as any).isActive ?? true,
        };
      } else {
        // Column doesn't exist, use query builder without is_active
        result = await this.configRepository
          .createQueryBuilder('config')
          .select([
            'config.function_call_name',
            'config.has_output',
            'config.is_sync',
            'config.processing_method',
            'config.metadata',
            'config.created_at',
            'config.updated_at',
          ])
          .where('config.function_call_name = :name', { name: functionCallName })
          .getRawOne();
        
        if (!result) {
          return null;
        }

        return {
          functionCallName: result.config_function_call_name,
          hasOutput: result.config_has_output,
          isSync: result.config_is_sync,
          processingMethod: result.config_processing_method,
          metadata: result.config_metadata,
          createdAt: result.config_created_at,
          updatedAt: result.config_updated_at,
          isActive: true, // Default value
        } as FunctionCallConfig;
      }
    } catch (error: any) {
      logger.error('Error getting function call config', {
        error: error.message,
        functionCallName,
      });
      throw error;
    }
  }

  /**
   * Get all configs
   */
  async getAll(): Promise<FunctionCallConfig[]> {
    let queryRunner: any = null;
    try {
      // Try to use normal query first (assumes column exists)
      try {
        const configs = await this.configRepository.find({
          order: { functionCallName: 'ASC' },
        });
        return configs.map(config => ({
          ...config,
          isActive: (config as any).isActive ?? true,
        }));
      } catch (normalQueryError: any) {
        // If normal query fails (e.g., column doesn't exist), use query builder
        logger.debug('Normal query failed, trying query builder', { error: normalQueryError.message });
        
        const results = await this.configRepository
          .createQueryBuilder('config')
          .select([
            'config.function_call_name',
            'config.has_output',
            'config.is_sync',
            'config.processing_method',
            'config.metadata',
            'config.created_at',
            'config.updated_at',
          ])
          .orderBy('config.function_call_name', 'ASC')
          .getRawMany();
        
        return results.map((result: any) => ({
          functionCallName: result.config_function_call_name,
          hasOutput: result.config_has_output,
          isSync: result.config_is_sync,
          processingMethod: result.config_processing_method,
          metadata: result.config_metadata,
          createdAt: result.config_created_at,
          updatedAt: result.config_updated_at,
          isActive: true, // Default value
        })) as FunctionCallConfig[];
      }
    } catch (error: any) {
      logger.error('Error getting all function call configs', { error: error.message, stack: error.stack });
      throw error;
    } finally {
      if (queryRunner) {
        try {
          await queryRunner.release();
        } catch (releaseError: any) {
          logger.warn('Error releasing query runner', { error: releaseError.message });
        }
      }
    }
  }

  /**
   * Create or update config
   */
  async createOrUpdate(
    functionCallName: string,
    dto: UpdateFunctionCallConfigDto
  ): Promise<FunctionCallConfig> {
    try {
      let config = await this.getByFunctionCallName(functionCallName);

      if (config) {
        Object.assign(config, dto);
      } else {
        config = this.configRepository.create({
          functionCallName,
          hasOutput: dto.hasOutput ?? false,
          isSync: dto.isSync ?? true,
          processingMethod: dto.processingMethod ?? ProcessingMethod.RABBITMQ,
          isActive: dto.isActive ?? true,
          metadata: dto.metadata,
          customAttributes: dto.customAttributes,
          processId: dto.processId ?? null,
        });
      }

      const saved = await this.configRepository.save(config);
      logger.info('Function call config saved', {
        functionCallName: saved.functionCallName,
        hasOutput: saved.hasOutput,
        isSync: saved.isSync,
        processingMethod: saved.processingMethod,
      });

      return saved;
    } catch (error: any) {
      logger.error('Error creating/updating function call config', {
        error: error.message,
        functionCallName,
      });
      throw error;
    }
  }

  /**
   * Create config automatically when function call prompt is created
   */
  async createConfigForFunctionCall(functionCallName: string): Promise<FunctionCallConfig> {
    try {
      const existing = await this.getByFunctionCallName(functionCallName);
      if (existing) {
        return existing;
      }

      const config = this.configRepository.create({
        functionCallName,
        hasOutput: false,
        isSync: true,
        processingMethod: ProcessingMethod.RABBITMQ,
        isActive: false, // Default to inactive
      });

      const saved = await this.configRepository.save(config);
      logger.info('Auto-created function call config', {
        functionCallName: saved.functionCallName,
      });

      return saved;
    } catch (error: any) {
      logger.error('Error auto-creating function call config', {
        error: error.message,
        functionCallName,
      });
      throw error;
    }
  }

  /**
   * Set hasOutput
   */
  async setHasOutput(functionCallName: string, hasOutput: boolean): Promise<FunctionCallConfig> {
    return this.createOrUpdate(functionCallName, { hasOutput });
  }

  /**
   * Set isSync
   */
  async setIsSync(functionCallName: string, isSync: boolean): Promise<FunctionCallConfig> {
    return this.createOrUpdate(functionCallName, { isSync });
  }

  /**
   * Set processing method
   */
  async setProcessingMethod(
    functionCallName: string,
    processingMethod: ProcessingMethod
  ): Promise<FunctionCallConfig> {
    return this.createOrUpdate(functionCallName, { processingMethod });
  }

  /**
   * Set isActive
   */
  async setIsActive(functionCallName: string, isActive: boolean): Promise<FunctionCallConfig> {
    return this.createOrUpdate(functionCallName, { isActive });
  }

  /**
   * Delete config
   */
  async delete(functionCallName: string): Promise<void> {
    try {
      const config = await this.getByFunctionCallName(functionCallName);
      if (!config) {
        logger.warn('Function call config not found, skipping deletion', { functionCallName });
        return; // Silently return if not found - already deleted or never existed
      }

      await this.configRepository.remove(config);
      logger.info('Function call config deleted', { functionCallName });
    } catch (error: any) {
      logger.error('Error deleting function call config', {
        error: error.message,
        functionCallName,
      });
      throw error;
    }
  }
}
