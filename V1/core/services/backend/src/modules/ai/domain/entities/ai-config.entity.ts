import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UUID } from '../../../../shared/types/common.types';

@Entity('ai_config')
export class AIConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ type: 'varchar', length: 100, unique: true })
  key!: string; // 'agent_prompt' or 'pending_functions'

  @Column({ type: 'text' })
  value!: string; // JSON string for complex values, plain text for prompt

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>; // Additional metadata (version, author, etc.)

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}