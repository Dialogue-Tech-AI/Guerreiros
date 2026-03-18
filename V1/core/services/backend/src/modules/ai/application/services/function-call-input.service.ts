import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { FunctionCallInput, InputFormat } from '../../domain/entities/function-call-input.entity';
import { UUID } from '../../../../shared/types/common.types';
import { logger } from '../../../../shared/utils/logger';

export interface CreateFunctionCallInputDto {
  functionCallName: string;
  inputFormat: InputFormat;
  template: string;
  conditions?: Record<string, any>;
  priority?: number;
  description?: string;
  metadata?: Record<string, any>;
  isActive?: boolean;
}

export interface UpdateFunctionCallInputDto {
  inputFormat?: InputFormat;
  template?: string;
  conditions?: Record<string, any>;
  priority?: number;
  description?: string;
  metadata?: Record<string, any>;
  isActive?: boolean;
}

export class FunctionCallInputService {
  private get inputRepository() {
    return AppDataSource.getRepository(FunctionCallInput);
  }

  async create(dto: CreateFunctionCallInputDto): Promise<FunctionCallInput> {
    try {
      const input = this.inputRepository.create({
        ...dto,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 0,
      });

      const saved = await this.inputRepository.save(input);
      logger.info('Function call input created', {
        id: saved.id,
        functionCallName: saved.functionCallName,
      });

      return saved;
    } catch (error: any) {
      logger.error('Error creating function call input', {
        error: error.message,
        dto,
      });
      throw error;
    }
  }

  async getByFunctionCallName(
    functionCallName: string,
    includeInactive = false
  ): Promise<FunctionCallInput[]> {
    const query = this.inputRepository
      .createQueryBuilder('input')
      .where('input.functionCallName = :name', { name: functionCallName })
      .orderBy('input.priority', 'DESC')
      .addOrderBy('input.createdAt', 'DESC');

    if (!includeInactive) {
      query.andWhere('input.isActive = :active', { active: true });
    }

    return query.getMany();
  }

  async getAll(includeInactive = false): Promise<FunctionCallInput[]> {
    const query = this.inputRepository
      .createQueryBuilder('input')
      .orderBy('input.functionCallName', 'ASC')
      .addOrderBy('input.priority', 'DESC')
      .addOrderBy('input.createdAt', 'DESC');

    if (!includeInactive) {
      query.where('input.isActive = :active', { active: true });
    }

    return query.getMany();
  }

  async getById(id: UUID): Promise<FunctionCallInput | null> {
    return this.inputRepository.findOne({ where: { id } });
  }

  async update(id: UUID, dto: UpdateFunctionCallInputDto): Promise<FunctionCallInput> {
    try {
      const input = await this.getById(id);
      if (!input) {
        throw new Error(`Function call input not found: ${id}`);
      }

      Object.assign(input, dto);
      const updated = await this.inputRepository.save(input);

      logger.info('Function call input updated', {
        id: updated.id,
        functionCallName: updated.functionCallName,
      });

      return updated;
    } catch (error: any) {
      logger.error('Error updating function call input', {
        error: error.message,
        id,
        dto,
      });
      throw error;
    }
  }

  async delete(id: UUID): Promise<void> {
    try {
      const result = await this.inputRepository.delete(id);
      if (result.affected === 0) {
        throw new Error(`Function call input not found: ${id}`);
      }

      logger.info('Function call input deleted', { id });
    } catch (error: any) {
      logger.error('Error deleting function call input', {
        error: error.message,
        id,
      });
      throw error;
    }
  }

  async toggleActive(id: UUID): Promise<FunctionCallInput> {
    const input = await this.getById(id);
    if (!input) {
      throw new Error(`Function call input not found: ${id}`);
    }

    input.isActive = !input.isActive;
    const updated = await this.inputRepository.save(input);

    logger.info('Function call input active status toggled', {
      id: updated.id,
      isActive: updated.isActive,
    });

    return updated;
  }

  /**
   * Get active input for a function call matching conditions
   */
  async getMatchingInput(
    functionCallName: string,
    functionCallResult: Record<string, any>
  ): Promise<FunctionCallInput | null> {
    const inputs = await this.getByFunctionCallName(functionCallName, false);
    const sorted = inputs.sort((a, b) => b.priority - a.priority);

    for (const input of sorted) {
      if (!input.conditions || Object.keys(input.conditions).length === 0) {
        return input;
      }

      let matches = true;
      for (const [key, value] of Object.entries(input.conditions)) {
        if (functionCallResult[key] !== value) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return input;
      }
    }

    return null;
  }

  /**
   * Format input template with function call result data
   */
  formatInput(input: FunctionCallInput, functionCallResult: Record<string, any>): string {
    if (input.inputFormat === InputFormat.TEXT) {
      return input.template;
    }

    if (input.inputFormat === InputFormat.TEMPLATE) {
      let formatted = input.template;
      for (const [key, value] of Object.entries(functionCallResult)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        formatted = formatted.replace(regex, String(value));
      }
      return formatted;
    }

    if (input.inputFormat === InputFormat.JSON) {
      return JSON.stringify(functionCallResult, null, 2);
    }

    return input.template;
  }
}
