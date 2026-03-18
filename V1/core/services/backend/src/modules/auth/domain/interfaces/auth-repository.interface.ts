import { User } from '../entities/user.entity';
import { UUID } from '../../../../shared/types/common.types';

export interface IAuthRepository {
  findById(id: UUID): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(user: Partial<User>): Promise<User>;
  update(id: UUID, data: Partial<User>): Promise<User>;
  delete(id: UUID): Promise<void>;
  findAll(): Promise<User[]>;
}
