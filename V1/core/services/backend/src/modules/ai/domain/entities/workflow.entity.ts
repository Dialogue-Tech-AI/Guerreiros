import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UUID } from '../../../../shared/types/common.types';

export type WorkflowNodeType = 'function' | 'router' | 'specialist' | 'tool' | 'recebe_mensagem' | 'envia_mensagem' | 'envia_mensagem_pronta' | 'identifica_tag' | 'adiciona_tag' | 'tag_sim_nao';

export type WorkflowHandleSide = 'top' | 'right' | 'bottom' | 'left';

export interface WorkflowHandlePosition {
  side: WorkflowHandleSide;
  offset: number;
}

export interface WorkflowNodeOutput {
  handle: string;
  targetNodeId: string;
  conditionType?: string;
  conditionValue?: unknown;
  isFallback?: boolean;
  /** Nome da entrada de destino que essa saída aceita conectar */
  targetEntryName?: string;
  /** Tipo(s) de nó que essa saída aceita conectar */
  targetEntryType?: WorkflowNodeType | WorkflowNodeType[];
  handlePosition?: WorkflowHandlePosition;
}

export interface WorkflowNodeInput {
  handle: string;
  name: string;
  /** Tipos de nó de origem que podem conectar nessa entrada */
  acceptsFromType?: WorkflowNodeType[];
  /** Se foi criada automaticamente pelo modo AUTO (ao clicar no +) */
  autoLinked?: boolean;
  /** ID do nó de origem que criou essa entrada (modo AUTO) */
  sourceNodeId?: string;
  /** Handle da saída de origem que criou essa entrada (modo AUTO) */
  sourceHandle?: string;
  handlePosition?: WorkflowHandlePosition;
}

export interface WorkflowNodeConfig {
  handler?: string;
  params?: Record<string, unknown>;
  routerId?: string;
  specialistId?: string;
  functionCallName?: string;
}

export interface WorkflowNodeDefinition {
  id: string;
  type: WorkflowNodeType;
  name: string;
  config: WorkflowNodeConfig;
  outputs: WorkflowNodeOutput[];
  inputs?: WorkflowNodeInput[];
  position?: { x: number; y: number };
}

export interface WorkflowEdgeDefinition {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

export interface WorkflowDefinition {
  version?: number;
  nodes: WorkflowNodeDefinition[];
  edges: WorkflowEdgeDefinition[];
}

@Entity('workflows')
export class Workflow {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'entry_node_id', type: 'varchar', length: 255, nullable: true })
  entryNodeId?: string | null;

  @Column({ type: 'jsonb', default: {} })
  definition!: WorkflowDefinition;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
