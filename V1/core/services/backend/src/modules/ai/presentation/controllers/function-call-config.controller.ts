import { Router, Request, Response } from 'express';
import {
  FunctionCallConfigService,
} from '../../application/services/function-call-config.service';
import { ProcessingMethod } from '../../domain/entities/function-call-config.entity';
import { logger } from '../../../../shared/utils/logger';
import { redisService } from '../../../../shared/infrastructure/redis/redis.service';

export class FunctionCallConfigController {
  public router: Router;
  private configService: FunctionCallConfigService;

  constructor() {
    this.router = Router();
    this.configService = new FunctionCallConfigService();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get('/', this.getAll.bind(this));
    this.router.get('/:functionCallName', this.getByFunctionCallName.bind(this));
    this.router.put('/:functionCallName', this.update.bind(this));
    this.router.patch('/:functionCallName', this.update.bind(this));
    this.router.patch('/:functionCallName/has-output', this.setHasOutput.bind(this));
    this.router.patch('/:functionCallName/is-sync', this.setIsSync.bind(this));
    this.router.patch('/:functionCallName/processing-method', this.setProcessingMethod.bind(this));
    this.router.patch('/:functionCallName/is-active', this.setIsActive.bind(this));
  }

  private async getAll(req: Request, res: Response): Promise<void> {
    try {
      const configs = await this.configService.getAll();
      res.status(200).json({
        success: true,
        data: configs,
      });
    } catch (error: any) {
      logger.error('Error getting all function call configs', { error: error.message });
      res.status(500).json({
        success: false,
        message: error.message || 'Erro ao buscar configurações',
      });
    }
  }

  private async getByFunctionCallName(req: Request, res: Response): Promise<void> {
    try {
      const { functionCallName } = req.params;
      const config = await this.configService.getByFunctionCallName(functionCallName);

      if (!config) {
        res.status(404).json({
          success: false,
          message: 'Configuração não encontrada',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: config,
      });
    } catch (error: any) {
      logger.error('Error getting function call config', {
        error: error.message,
        functionCallName: req.params.functionCallName,
      });
      res.status(500).json({
        success: false,
        message: error.message || 'Erro ao buscar configuração',
      });
    }
  }

  private async update(req: Request, res: Response): Promise<void> {
    try {
      const { functionCallName } = req.params;
      const config = await this.configService.createOrUpdate(functionCallName, req.body);

      try {
        if (redisService.isConnected()) {
          await redisService.publishConfigUpdate('function_call', functionCallName);
          logger.info('Redis event published for function call config update', { functionCallName });
        }
      } catch (redisErr: any) {
        logger.warn('Failed to publish Redis event (non-critical)', {
          error: redisErr?.message,
          functionCallName,
        });
      }

      res.status(200).json({
        success: true,
        data: config,
        message: 'Configuração atualizada com sucesso',
      });
    } catch (error: any) {
      logger.error('Error updating function call config', {
        error: error.message,
        functionCallName: req.params.functionCallName,
      });
      res.status(500).json({
        success: false,
        message: error.message || 'Erro ao atualizar configuração',
      });
    }
  }

  private async setHasOutput(req: Request, res: Response): Promise<void> {
    try {
      const { functionCallName } = req.params;
      const { hasOutput } = req.body;

      if (typeof hasOutput !== 'boolean') {
        res.status(400).json({
          success: false,
          message: 'hasOutput deve ser um boolean',
        });
        return;
      }

      const config = await this.configService.setHasOutput(functionCallName, hasOutput);

      res.status(200).json({
        success: true,
        data: config,
        message: 'hasOutput atualizado com sucesso',
      });
    } catch (error: any) {
      logger.error('Error setting hasOutput', {
        error: error.message,
        functionCallName: req.params.functionCallName,
      });
      res.status(500).json({
        success: false,
        message: error.message || 'Erro ao atualizar hasOutput',
      });
    }
  }

  private async setIsSync(req: Request, res: Response): Promise<void> {
    try {
      const { functionCallName } = req.params;
      const { isSync } = req.body;

      if (typeof isSync !== 'boolean') {
        res.status(400).json({
          success: false,
          message: 'isSync deve ser um boolean',
        });
        return;
      }

      const config = await this.configService.setIsSync(functionCallName, isSync);

      res.status(200).json({
        success: true,
        data: config,
        message: 'isSync atualizado com sucesso',
      });
    } catch (error: any) {
      logger.error('Error setting isSync', {
        error: error.message,
        functionCallName: req.params.functionCallName,
      });
      res.status(500).json({
        success: false,
        message: error.message || 'Erro ao atualizar isSync',
      });
    }
  }

  private async setProcessingMethod(req: Request, res: Response): Promise<void> {
    try {
      const { functionCallName } = req.params;
      const { processingMethod } = req.body;

      if (!Object.values(ProcessingMethod).includes(processingMethod)) {
        res.status(400).json({
          success: false,
          message: `processingMethod deve ser um dos valores: ${Object.values(ProcessingMethod).join(', ')}`,
        });
        return;
      }

      const config = await this.configService.setProcessingMethod(
        functionCallName,
        processingMethod
      );

      res.status(200).json({
        success: true,
        data: config,
        message: 'processingMethod atualizado com sucesso',
      });
    } catch (error: any) {
      logger.error('Error setting processingMethod', {
        error: error.message,
        functionCallName: req.params.functionCallName,
      });
      res.status(500).json({
        success: false,
        message: error.message || 'Erro ao atualizar processingMethod',
      });
    }
  }

  private async setIsActive(req: Request, res: Response): Promise<void> {
    try {
      const { functionCallName } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        res.status(400).json({
          success: false,
          message: 'isActive deve ser um boolean',
        });
        return;
      }

      // Se estiver tentando ativar, verificar se a config tem conteúdo (objetivo, quando acionar ou campos obrigatórios)
      if (isActive === true) {
        const config = await this.configService.getByFunctionCallName(functionCallName);
        if (!config || !FunctionCallConfigService.isConfigMeaningful(config)) {
          res.status(400).json({
            success: false,
            message:
              'Não é possível ativar sem configurar Objetivo, Quando acionar ou Campos obrigatórios no painel.',
          });
          return;
        }
      }

      const config = await this.configService.setIsActive(functionCallName, isActive);

      res.status(200).json({
        success: true,
        data: config,
        message: 'isActive atualizado com sucesso',
      });
    } catch (error: any) {
      logger.error('Error setting isActive', {
        error: error.message,
        functionCallName: req.params.functionCallName,
      });
      res.status(500).json({
        success: false,
        message: error.message || 'Erro ao atualizar isActive',
      });
    }
  }
}
