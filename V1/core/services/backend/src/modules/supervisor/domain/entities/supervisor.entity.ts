import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  ManyToMany,
  JoinColumn,
} from 'typeorm';
import { VehicleBrand, UUID } from '../../../../shared/types/common.types';
import { User } from '../../../auth/domain/entities/user.entity';
import { Seller } from '../../../seller/domain/entities/seller.entity';

@Entity('supervisors')
export class Supervisor {
  @PrimaryColumn('uuid')
  id!: UUID;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'id' })
  user!: User;

  @Column({ name: 'admin_id', type: 'uuid', nullable: true })
  adminId?: UUID;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'admin_id' })
  admin?: User;

  @Column({ type: 'jsonb' })
  brands!: VehicleBrand[];

  /** Vendedores que este supervisor pode ver (N:N) */
  @ManyToMany(() => Seller, (seller) => seller.supervisors)
  sellers?: Seller[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  // Methods
  supervisesBrand(brand: VehicleBrand): boolean {
    return this.brands.includes(brand);
  }

  addBrand(brand: VehicleBrand): void {
    if (!this.supervisesBrand(brand)) {
      this.brands.push(brand);
    }
  }

  removeBrand(brand: VehicleBrand): void {
    this.brands = this.brands.filter((b) => b !== brand);
  }
}
