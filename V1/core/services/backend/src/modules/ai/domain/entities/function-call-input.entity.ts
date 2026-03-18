import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UUID } from '../../../../shared/types/common.types';

export enum InputFormat {
  TEXT = 'TEXT',
  TEMPLATE = 'TEMPLATE', // Com variáveis {{variable}}
  JSON = 'JSON',
}

@Entity('function_call_inputs')
export class FunctionCallInput {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ name: 'function_call_name', type: 'varchar', length: 100 })
  functionCallName!: string; // Ex: 'classificar_intencao', 'rotear_para_vendedor'

  @Column({
    name: 'input_format',
    type: 'enum',
    enum: InputFormat,
    enumName: 'input_format_enum',
    default: InputFormat.TEXT,
  })
  inputFormat!: InputFormat;

  @Column({ name: 'template', type: 'text' })
  template!: string; // Template (pode conter {{variables}})

  @Column({ name: 'conditions', type: 'jsonb', nullable: true })
  conditions?: Record<string, any>; // Condições para usar este input (ex: { intention: 'COMPRA' })

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'priority', type: 'integer', default: 0 })
  priority!: number; // Ordem de prioridade (maior = mais prioritário)

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
