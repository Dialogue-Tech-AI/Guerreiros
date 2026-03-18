import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UUID } from '../../../../shared/types/common.types';

export type RouterType = 'llm_choice' | 'intent_channel' | 'keyword' | 'condition';

@Entity('routers')
export class Router {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ type: 'varchar', length: 100, unique: true })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'router_type', type: 'varchar', length: 50, default: 'llm_choice' })
  routerType!: RouterType;

  @Column({ type: 'text', nullable: true })
  prompt?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model?: string | null;

  @Column({ type: 'float', nullable: true })
  temperature?: number | null;

  /** Options specific to router_type (e.g. keywords, intent_channel mapping). */
  @Column({ type: 'jsonb', nullable: true })
  config?: Record<string, unknown> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
