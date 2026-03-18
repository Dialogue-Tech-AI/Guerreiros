import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { UUID } from '../../../../shared/types/common.types';

export enum NotificationType {
  NEW_MESSAGE = 'NEW_MESSAGE',
  ATTENDANCE_ROUTED = 'ATTENDANCE_ROUTED',
  ATTENDANCE_ASSIGNED = 'ATTENDANCE_ASSIGNED',
  ATTENDANCE_CLOSED = 'ATTENDANCE_CLOSED',
  /** Conversa realocada para intervenção (ex.: Demanda telefone fixo) */
  ATTENDANCE_RELOCATED_INTERVENTION = 'ATTENDANCE_RELOCATED_INTERVENTION',
  SYSTEM = 'SYSTEM',
}

export enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: UUID;

  @Column({ type: 'varchar', length: 50 })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 20, default: NotificationPriority.MEDIUM })
  priority!: NotificationPriority;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead!: boolean;

  @Column({ name: 'read_at', type: 'timestamp', nullable: true })
  readAt?: Date;

  @Column({ name: 'attendance_id', type: 'uuid', nullable: true })
  attendanceId?: UUID;

  @Column({ name: 'reference_id', type: 'varchar', length: 255, nullable: true })
  referenceId?: string;

  @Column({ name: 'action_url', type: 'varchar', length: 500, nullable: true })
  actionUrl?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt?: Date;
}
