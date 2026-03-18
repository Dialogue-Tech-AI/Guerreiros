import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MessageOrigin, MessageStatus, UUID } from '../../../../shared/types/common.types';
import { Attendance } from '../../../attendance/domain/entities/attendance.entity';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ name: 'attendance_id', type: 'uuid' })
  attendanceId!: UUID;

  @ManyToOne(() => Attendance)
  @JoinColumn({ name: 'attendance_id' })
  attendance!: Attendance;

  @Column({ type: 'enum', enum: MessageOrigin })
  origin!: MessageOrigin;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ 
    type: 'enum', 
    enum: MessageStatus, 
    default: MessageStatus.SENT,
    nullable: false 
  })
  status!: MessageStatus;

  @CreateDateColumn({ name: 'sent_at' })
  sentAt!: Date;

  // Methods
  isFromClient(): boolean {
    return this.origin === MessageOrigin.CLIENT;
  }

  isFromAI(): boolean {
    return this.origin === MessageOrigin.AI;
  }

  isFromSeller(): boolean {
    return this.origin === MessageOrigin.SELLER;
  }

  isFromSystem(): boolean {
    return this.origin === MessageOrigin.SYSTEM;
  }
}
