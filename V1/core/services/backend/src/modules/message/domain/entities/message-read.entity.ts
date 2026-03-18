import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UUID } from '../../../../shared/types/common.types';
import { Attendance } from '../../../attendance/domain/entities/attendance.entity';
import { User } from '../../../auth/domain/entities/user.entity';

@Entity('message_reads')
export class MessageRead {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ name: 'attendance_id', type: 'uuid' })
  attendanceId!: UUID;

  @ManyToOne(() => Attendance)
  @JoinColumn({ name: 'attendance_id' })
  attendance!: Attendance;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: UUID;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'last_read_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastReadAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
