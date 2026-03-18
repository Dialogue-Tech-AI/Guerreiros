import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UUID } from '../../../../shared/types/common.types';

@Entity('multi_agent_config')
export class MultiAgentConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ name: 'is_enabled', type: 'boolean', default: false })
  isEnabled!: boolean;

  /** Prompt usado em todos os agentes especialistas; concatenado antes do prompt individual. */
  @Column({ name: 'universal_prompt', type: 'text', nullable: true })
  universalPrompt?: string | null;

  /** Function calls presentes em todos os agentes especialistas; concatenadas antes das individuais de cada agente. */
  @Column({ name: 'universal_function_calls', type: 'jsonb', nullable: true, default: '[]' })
  universalFunctionCalls?: string[] | null;

  /** Roteador de entrada do fluxo modular. Se workflow_id for null, o worker usa entry_router_id. */
  @Column({ name: 'entry_router_id', type: 'uuid', nullable: true })
  entryRouterId?: UUID | null;

  /** Workflow (grafo) ativo. Se preenchido, o worker usa o WorkflowRunner; senão, usa entry_router_id. */
  @Column({ name: 'workflow_id', type: 'uuid', nullable: true })
  workflowId?: UUID | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
