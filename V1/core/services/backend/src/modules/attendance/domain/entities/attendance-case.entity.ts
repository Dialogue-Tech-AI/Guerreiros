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
import { CaseStatus } from '../../../../shared/types/common.types';
import { Attendance } from './attendance.entity';
import { CaseType } from './case-type.entity';

@Entity('attendance_cases')
export class AttendanceCase {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ name: 'attendance_id', type: 'uuid' })
  attendanceId!: UUID;

  @ManyToOne(() => Attendance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attendance_id' })
  attendance?: Attendance;

  @Column({ name: 'case_type_id', type: 'uuid' })
  caseTypeId!: UUID;

  @ManyToOne(() => CaseType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'case_type_id' })
  caseType?: CaseType;

  @Column({ type: 'varchar', length: 64 })
  status!: CaseStatus;

  @Column({ type: 'varchar', length: 256, nullable: true })
  title?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
