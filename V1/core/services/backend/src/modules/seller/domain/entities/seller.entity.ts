import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
} from 'typeorm';
import { VehicleBrand, UUID } from '../../../../shared/types/common.types';
import { User } from '../../../auth/domain/entities/user.entity';
import { Supervisor } from '../../../supervisor/domain/entities/supervisor.entity';

@Entity('sellers')
export class Seller {
  @PrimaryColumn('uuid')
  id!: UUID;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'id' })
  user!: User;

  /** Supervisor principal (usado no roteamento). Relação N:N em supervisors para visibilidade. */
  @Column({ name: 'supervisor_id', type: 'uuid', nullable: true })
  supervisorId?: UUID;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'supervisor_id' })
  supervisor?: User;

  /** Vários supervisores podem ver este vendedor (N:N) */
  @ManyToMany(() => Supervisor, (sup) => sup.sellers)
  @JoinTable({
    name: 'seller_supervisors',
    joinColumn: { name: 'seller_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'supervisor_id', referencedColumnName: 'id' },
  })
  supervisors?: Supervisor[];

  @Column({ type: 'jsonb' })
  brands!: VehicleBrand[];

  @Column({ name: 'round_robin_order', type: 'integer', default: 0 })
  roundRobinOrder!: number;

  @Column({ name: 'unavailable_until', type: 'timestamp', nullable: true })
  unavailableUntil?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  // Methods
  handlesBrand(brand: VehicleBrand): boolean {
    return this.brands.includes(brand);
  }

  addBrand(brand: VehicleBrand): void {
    if (!this.handlesBrand(brand)) {
      this.brands.push(brand);
    }
  }

  removeBrand(brand: VehicleBrand): void {
    this.brands = this.brands.filter((b) => b !== brand);
  }
}
