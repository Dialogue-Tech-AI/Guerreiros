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
import { Purchase } from '../../../purchase/domain/entities/purchase.entity';
import { Attendance } from '../../../attendance/domain/entities/attendance.entity';

@Entity('warranties')
export class Warranty {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ name: 'purchase_id', type: 'uuid' })
  purchaseId!: UUID;

  @ManyToOne(() => Purchase)
  @JoinColumn({ name: 'purchase_id' })
  purchase!: Purchase;

  @Column({ name: 'attendance_id', type: 'uuid' })
  attendanceId!: UUID;

  @ManyToOne(() => Attendance)
  @JoinColumn({ name: 'attendance_id' })
  attendance!: Attendance;

  @Column({ name: 'start_date', type: 'timestamp' })
  startDate!: Date;

  @Column({ name: 'end_date', type: 'timestamp' })
  endDate!: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'claims_count', type: 'integer', default: 0 })
  claimsCount!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Methods
  isExpired(): boolean {
    return new Date() > this.endDate;
  }

  updateActiveStatus(): void {
    this.isActive = !this.isExpired();
  }

  incrementClaims(): void {
    this.claimsCount += 1;
  }
}
