import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Processo do sistema: "a partir de um acionamento (function call) com as informações X o sistema faz Y".
 * Somente leitura na UI (pasta Processos na biblioteca). Criação/edição por seed ou admin.
 */
@Entity('processes')
export class Process {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** Nome da function call que aciona este processo (acionador). */
  @Column({ name: 'trigger_function_call_name', type: 'varchar', length: 100, nullable: true })
  triggerFunctionCallName!: string | null;

  /** Nomes dos campos obrigatórios (X) preenchidos quando o acionador é executado. */
  @Column({ name: 'required_inputs', type: 'jsonb', nullable: true })
  requiredInputs!: string[] | null;

  /** Nomes dos campos opcionais. */
  @Column({ name: 'optional_inputs', type: 'jsonb', nullable: true })
  optionalInputs!: string[] | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
