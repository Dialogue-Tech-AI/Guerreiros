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
import { Router } from './router.entity';

export type DestinationType = 'specialist' | 'router' | 'fixed';

@Entity('router_outputs')
export class RouterOutput {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ name: 'router_id', type: 'uuid' })
  routerId!: UUID;

  @ManyToOne(() => Router, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'router_id' })
  router?: Router;

  @Column({ type: 'varchar', length: 200 })
  label!: string;

  @Column({ name: 'condition_type', type: 'varchar', length: 50, nullable: true })
  conditionType?: string | null;

  @Column({ name: 'condition_value', type: 'jsonb', nullable: true })
  conditionValue?: Record<string, unknown> | null;

  @Column({ name: 'destination_type', type: 'varchar', length: 20 })
  destinationType!: DestinationType;

  /** UUID of specialist_agents.id or routers.id when destination_type is specialist or router. */
  @Column({ name: 'destination_id', type: 'uuid', nullable: true })
  destinationId?: UUID | null;

  @Column({ name: 'response_text', type: 'text', nullable: true })
  responseText?: string | null;

  @Column({ name: 'is_fallback', type: 'boolean', default: false })
  isFallback!: boolean;

  @Column({ name: 'order_index', type: 'int', default: 0 })
  orderIndex!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
