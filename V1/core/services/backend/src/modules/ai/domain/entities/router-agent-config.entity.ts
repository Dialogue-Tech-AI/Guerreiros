import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UUID } from '../../../../shared/types/common.types';

export interface RouterResponseItem {
  id: string;
  label: string;
  response: string;
  is_active: boolean;
  specialist_name: string | null;
}

export interface IntentRoutingResponseItem {
  id: string;
  label: string;
  is_active: boolean;
  /**
   * Se requires_channel=false, este é o agente usado diretamente.
   * Se requires_channel=true, pode ser usado como fallback caso o canal não esteja mapeado.
   */
  specialist_name: string | null;
  /**
   * Quando true, roda a Etapa 2 (Canal) e usa channel_specialists.
   */
  requires_channel?: boolean;
  /**
   * Mapeamento opcional de canal → agente, usado quando requires_channel=true.
   */
  channel_specialists?: Record<string, string | null>;
}

@Entity('router_agent_config')
export class RouterAgentConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ type: 'text' })
  prompt!: string;

  @Column({ name: 'two_stage_enabled', type: 'boolean', default: false })
  twoStageEnabled!: boolean;

  @Column({ name: 'router_mode', type: 'varchar', length: 50, default: 'single_stage' })
  routerMode!: string;

  @Column({ name: 'intent_channel_mapping', type: 'jsonb', nullable: true })
  intentChannelMapping?: Record<string, any>;

  @Column({ name: 'prompt_stage1', type: 'text', nullable: true })
  promptStage1?: string | null;

  @Column({ name: 'model_stage1', type: 'varchar', length: 100, nullable: true })
  modelStage1?: string | null;

  @Column({ name: 'temperature_stage1', type: 'float', nullable: true })
  temperatureStage1?: number | null;

  @Column({ name: 'prompt_stage2', type: 'text', nullable: true })
  promptStage2?: string | null;

  @Column({ name: 'model_stage2', type: 'varchar', length: 100, nullable: true })
  modelStage2?: string | null;

  @Column({ name: 'temperature_stage2', type: 'float', nullable: true })
  temperatureStage2?: number | null;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ type: 'float', default: 0.7 })
  temperature!: number;

  @Column({ name: 'routing_rules', type: 'jsonb', nullable: true })
  routingRules?: Record<string, any>;

  @Column({ name: 'routing_responses', type: 'jsonb', nullable: true, default: '[]' })
  routingResponses?: RouterResponseItem[];

  @Column({ name: 'intent_routing_responses', type: 'jsonb', nullable: true, default: '[]' })
  intentRoutingResponses?: IntentRoutingResponseItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
