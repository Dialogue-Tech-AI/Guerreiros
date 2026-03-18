import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { UUID } from '../../../../shared/types/common.types';
import { Attendance } from '../../../attendance/domain/entities/attendance.entity';

@Entity('ai_response_costs')
export class AiResponseCost {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ name: 'attendance_id', type: 'uuid' })
  attendanceId!: UUID;

  @ManyToOne(() => Attendance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attendance_id' })
  attendance?: Attendance;

  @Column({ name: 'message_id', type: 'uuid', nullable: true })
  messageId?: UUID;

  @Column({ name: 'client_phone', type: 'varchar', length: 64, nullable: true })
  clientPhone?: string;

  /** text | audio | image */
  @Column({ type: 'varchar', length: 32, default: 'text' })
  scenario!: string;

  @Column({ type: 'varchar', length: 64 })
  model!: string;

  @Column({ name: 'prompt_tokens', type: 'int', default: 0 })
  promptTokens!: number;

  @Column({ name: 'completion_tokens', type: 'int', default: 0 })
  completionTokens!: number;

  @Column({ name: 'total_tokens', type: 'int', default: 0 })
  totalTokens!: number;

  @Column({ name: 'whisper_minutes', type: 'decimal', precision: 10, scale: 4, nullable: true })
  whisperMinutes?: number;

  @Column({ name: 'usd_cost', type: 'decimal', precision: 12, scale: 6, default: 0 })
  usdCost!: number;

  @Column({ name: 'brl_cost', type: 'decimal', precision: 12, scale: 6, default: 0 })
  brlCost!: number;

  // --- Multi-agent breakdown (router vs specialist) ---

  @Column({ name: 'router_model', type: 'varchar', length: 64, nullable: true })
  routerModel?: string;

  @Column({ name: 'router_prompt_tokens', type: 'int', default: 0 })
  routerPromptTokens!: number;

  @Column({ name: 'router_completion_tokens', type: 'int', default: 0 })
  routerCompletionTokens!: number;

  @Column({ name: 'router_total_tokens', type: 'int', default: 0 })
  routerTotalTokens!: number;

  @Column({ name: 'router_usd_cost', type: 'decimal', precision: 12, scale: 6, default: 0 })
  routerUsdCost!: number;

  @Column({ name: 'router_brl_cost', type: 'decimal', precision: 12, scale: 6, default: 0 })
  routerBrlCost!: number;

  @Column({ name: 'specialist_name', type: 'varchar', length: 255, nullable: true })
  specialistName?: string;

  @Column({ name: 'specialist_model', type: 'varchar', length: 64, nullable: true })
  specialistModel?: string;

  @Column({ name: 'specialist_prompt_tokens', type: 'int', default: 0 })
  specialistPromptTokens!: number;

  @Column({ name: 'specialist_completion_tokens', type: 'int', default: 0 })
  specialistCompletionTokens!: number;

  @Column({ name: 'specialist_total_tokens', type: 'int', default: 0 })
  specialistTotalTokens!: number;

  @Column({ name: 'specialist_usd_cost', type: 'decimal', precision: 12, scale: 6, default: 0 })
  specialistUsdCost!: number;

  @Column({ name: 'specialist_brl_cost', type: 'decimal', precision: 12, scale: 6, default: 0 })
  specialistBrlCost!: number;

  /** Log completo da execução (roteamento, prompt, ChatML, tools, etc.) para debug na aba Custos */
  @Column({ name: 'execution_log', type: 'jsonb', nullable: true })
  executionLog?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
