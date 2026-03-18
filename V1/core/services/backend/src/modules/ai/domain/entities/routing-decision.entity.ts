import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { UUID } from '../../../../shared/types/common.types';

@Entity('routing_decisions')
export class RoutingDecision {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ name: 'attendance_id', type: 'uuid' })
  attendanceId!: UUID;

  @Column({ name: 'message_id', type: 'uuid', nullable: true })
  messageId?: UUID | null;

  @Column({ name: 'router_id', type: 'uuid' })
  routerId!: UUID;

  @Column({ name: 'output_id', type: 'uuid', nullable: true })
  outputId?: UUID | null;

  @Column({ name: 'destination_type', type: 'varchar', length: 20 })
  destinationType!: string;

  @Column({ name: 'destination_id', type: 'uuid', nullable: true })
  destinationId?: UUID | null;

  @Column({ name: 'response_id', type: 'varchar', length: 200, nullable: true })
  responseId?: string | null;

  @Column({ name: 'intent_id', type: 'varchar', length: 100, nullable: true })
  intentId?: string | null;

  @Column({ name: 'channel', type: 'varchar', length: 50, nullable: true })
  channel?: string | null;

  @Column({ type: 'float', nullable: true })
  confidence?: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
