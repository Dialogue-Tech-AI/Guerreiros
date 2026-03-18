import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { UUID } from '../../../../shared/types/common.types';

@Entity('case_types')
export class CaseType {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ type: 'varchar', length: 64, unique: true })
  key!: string;

  @Column({ type: 'varchar', length: 128 })
  label!: string;

  @Column({ name: 'can_stay_open', type: 'boolean', default: true })
  canStayOpen!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int', default: 0 })
  ordem!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
