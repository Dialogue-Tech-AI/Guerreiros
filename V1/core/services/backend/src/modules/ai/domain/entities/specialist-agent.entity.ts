import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UUID } from '../../../../shared/types/common.types';

@Entity('specialist_agents')
export class SpecialistAgent {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ type: 'varchar', length: 100, unique: true })
  name!: string;

  @Column({ type: 'text' })
  prompt!: string;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ type: 'float', default: 0.7 })
  temperature!: number;

  @Column({ name: 'function_call_names', type: 'jsonb', nullable: true, default: '[]' })
  functionCallNames?: string[];

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
