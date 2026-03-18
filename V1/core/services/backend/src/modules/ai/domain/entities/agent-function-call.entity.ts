import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UUID } from '../../../../shared/types/common.types';

@Entity('agent_function_calls')
export class AgentFunctionCall {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  objective?: string;

  @Column({ name: 'trigger_conditions', type: 'text', nullable: true })
  triggerConditions?: string;

  @Column({ name: 'execution_timing', type: 'text', nullable: true })
  executionTiming?: string;

  @Column({ name: 'required_fields', type: 'text', nullable: true })
  requiredFields?: string;

  @Column({ name: 'optional_fields', type: 'text', nullable: true })
  optionalFields?: string;

  @Column({ type: 'text', nullable: true })
  restrictions?: string;

  @Column({ name: 'processing_notes', type: 'text', nullable: true })
  processingNotes?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'has_output', type: 'boolean', default: false })
  hasOutput!: boolean;

  @Column({
    name: 'processing_method',
    type: 'varchar',
    length: 20,
    default: 'RABBITMQ',
  })
  processingMethod!: 'RABBITMQ' | 'HTTP';

  @Column({ name: 'custom_attributes', type: 'jsonb', nullable: true })
  customAttributes?: Record<string, string>;

  @Column({ name: 'biblioteca_id', type: 'uuid', nullable: true })
  bibliotecaId!: UUID | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
