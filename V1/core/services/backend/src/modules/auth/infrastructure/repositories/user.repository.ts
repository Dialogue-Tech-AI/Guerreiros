import { Repository } from 'typeorm';
import { User } from '../../domain/entities/user.entity';
import { IAuthRepository } from '../../domain/interfaces/auth-repository.interface';
import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { UUID } from '../../../../shared/types/common.types';
import { NotFoundException } from '../../../../shared/domain/exceptions/domain-exception';

export class UserRepository implements IAuthRepository {
  private repository: Repository<User>;

  constructor() {
    this.repository = AppDataSource.getRepository(User);
  }

  async findById(id: UUID): Promise<User | null> {
    return await this.repository.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.repository.findOne({ where: { email } });
  }

  async create(data: Partial<User>): Promise<User> {
    const user = this.repository.create(data);
    return await this.repository.save(user);
  }

  async update(id: UUID, data: Partial<User>): Promise<User> {
    const user = await this.findById(id);
    
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    Object.assign(user, data);
    return await this.repository.save(user);
  }

  async delete(id: UUID): Promise<void> {
    const result = await this.repository.delete(id);
    
    if (result.affected === 0) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
  }

  async findAll(): Promise<User[]> {
    return await this.repository.find();
  }
}
