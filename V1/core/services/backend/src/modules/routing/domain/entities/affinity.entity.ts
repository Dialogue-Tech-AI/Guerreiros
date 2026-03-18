import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { VehicleBrand, UUID } from '../../../../shared/types/common.types';
import { User } from '../../../auth/domain/entities/user.entity';

@Entity('affinities')
@Index(['clientPhone', 'brand'], { unique: true })
export class Affinity {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ name: 'client_phone', type: 'varchar', length: 20 })
  clientPhone!: string;

  @Column({ type: 'enum', enum: VehicleBrand })
  brand!: VehicleBrand;

  @Column({ name: 'seller_id', type: 'uuid' })
  sellerId!: UUID;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'seller_id' })
  seller!: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'last_used_at' })
  lastUsedAt!: Date;

  // Methods
  updateLastUsed(): void {
    this.lastUsedAt = new Date();
  }

  isExpired(retentionDays: number): boolean {
    const expirationDate = new Date(this.lastUsedAt);
    expirationDate.setDate(expirationDate.getDate() + retentionDays);
    return new Date() > expirationDate;
  }
}
