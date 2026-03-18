import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ProcessingMethod {
  RABBITMQ = 'RABBITMQ',
  HTTP = 'HTTP', // Em breve
}

@Entity('function_call_configs')
export class FunctionCallConfig {
  @PrimaryColumn({ name: 'function_call_name', type: 'varchar', length: 100 })
  functionCallName!: string;

  @Column({ name: 'has_output', type: 'boolean', default: false })
  hasOutput!: boolean;

  @Column({ name: 'is_sync', type: 'boolean', default: true })
  isSync!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true, nullable: true })
  isActive?: boolean;

  @Column({
    name: 'processing_method',
    type: 'enum',
    enum: ProcessingMethod,
    default: ProcessingMethod.RABBITMQ,
  })
  processingMethod!: ProcessingMethod;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ name: 'trigger_conditions', type: 'text', nullable: true })
  triggerConditions?: string;

  @Column({ name: 'execution_timing', type: 'text', nullable: true })
  executionTiming?: string;

  @Column({ name: 'objective', type: 'text', nullable: true })
  objective?: string;

  @Column({ name: 'required_fields', type: 'jsonb', nullable: true })
  requiredFields?: string[];

  @Column({ name: 'optional_fields', type: 'jsonb', nullable: true })
  optionalFields?: string[];

  @Column({ name: 'restrictions', type: 'text', nullable: true })
  restrictions?: string;

  @Column({ name: 'processing_notes', type: 'text', nullable: true })
  processingNotes?: string;

  @Column({ name: 'custom_attributes', type: 'jsonb', nullable: true })
  customAttributes?: Record<string, unknown>;

  /** ID do processo vinculado: quando esta function call for executada, o processo também será. */
  @Column({ name: 'process_id', type: 'uuid', nullable: true })
  processId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
