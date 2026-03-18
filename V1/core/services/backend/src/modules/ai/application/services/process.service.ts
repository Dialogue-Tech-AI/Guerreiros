import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { Process } from '../../domain/entities/process.entity';
import { FunctionCallConfig } from '../../domain/entities/function-call-config.entity';

export class ProcessService {
  private get processRepository() {
    return AppDataSource.getRepository(Process);
  }

  private get configRepository() {
    return AppDataSource.getRepository(FunctionCallConfig);
  }

  /** Lista todos os processos (somente leitura na UI). */
  async getAll(): Promise<Process[]> {
    return this.processRepository.find({
      order: { name: 'ASC' },
    });
  }

  async getById(id: string): Promise<Process | null> {
    return this.processRepository.findOne({ where: { id } });
  }

  async deleteById(id: string): Promise<boolean> {
    await this.configRepository.update({ processId: id }, { processId: null });
    const result = await this.processRepository.delete(id);
    return (result.affected ?? 0) > 0;
  }
}
