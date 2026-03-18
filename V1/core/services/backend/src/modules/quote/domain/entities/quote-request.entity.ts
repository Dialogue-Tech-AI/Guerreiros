import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { UUID } from '../../../../shared/types/common.types';
import { Attendance } from '../../../attendance/domain/entities/attendance.entity';
import { User } from '../../../auth/domain/entities/user.entity';

export type QuoteRequestStatus = 'pendente' | 'em_elaboracao' | 'enviado';

export interface QuoteItem {
  description?: string;
  quantity?: number;
  unit?: string;
  value?: number;
  [k: string]: unknown;
}

export interface QuoteQuestionAnswer {
  question: string;
  answer: string;
  at: string; // ISO timestamp
}

@Entity('quote_requests')
export class QuoteRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ name: 'attendance_id', type: 'uuid' })
  attendanceId!: UUID;

  @ManyToOne(() => Attendance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attendance_id' })
  attendance?: Attendance;

  @Column({ name: 'seller_id', type: 'uuid', nullable: true })
  sellerId?: UUID;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'seller_id' })
  seller?: User;

  @Column({ name: 'seller_subdivision', type: 'varchar', length: 64, default: 'pedidos-orcamentos' })
  sellerSubdivision!: string;

  @Column({ name: 'client_phone', type: 'varchar', length: 64 })
  clientPhone!: string;

  @Column({ name: 'client_name', type: 'varchar', length: 256, nullable: true })
  clientName?: string;

  @Column({ type: 'jsonb', nullable: true })
  items?: QuoteItem[];

  @Column({ type: 'text', nullable: true })
  observations?: string;

  /** Informações estruturadas do veículo e pedido */
  @Column({ name: 'vehicle_info', type: 'jsonb', nullable: true })
  vehicleInfo?: {
    marca?: string;
    modelo?: string;
    ano?: string;
    peca?: string;
    placa?: string;
    resumo?: string;
  };

  @Column({ type: 'varchar', length: 32, default: 'pendente' })
  status!: QuoteRequestStatus;

  @Column({ name: 'question_answers', type: 'jsonb', nullable: true })
  questionAnswers?: QuoteQuestionAnswer[];

  /** Timestamp de quando o vendedor visualizou este pedido (null = não visto) */
  @Column({ name: 'seller_viewed_at', type: 'timestamptz', nullable: true })
  sellerViewedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
