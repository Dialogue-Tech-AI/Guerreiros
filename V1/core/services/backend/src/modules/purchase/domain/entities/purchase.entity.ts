import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  VehicleBrand,
  PurchaseOrigin,
  PurchaseStatus,
  PaymentMethod,
  DeliveryMethod,
  UUID,
} from '../../../../shared/types/common.types';
import { Attendance } from '../../../attendance/domain/entities/attendance.entity';
import { User } from '../../../auth/domain/entities/user.entity';

export interface PurchaseItem {
  partName: string;
  quantity: number;
  price: number;
  total: number;
}

@Entity('purchases')
export class Purchase {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ name: 'attendance_id', type: 'uuid' })
  attendanceId!: UUID;

  @ManyToOne(() => Attendance)
  @JoinColumn({ name: 'attendance_id' })
  attendance!: Attendance;

  @Column({ name: 'seller_id', type: 'uuid' })
  sellerId!: UUID;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'seller_id' })
  seller!: User;

  @Column({ name: 'client_phone', type: 'varchar', length: 20 })
  clientPhone!: string;

  @Column({ name: 'vehicle_brand', type: 'enum', enum: VehicleBrand })
  vehicleBrand!: VehicleBrand;

  @Column({ name: 'vehicle_model', type: 'varchar', length: 100 })
  vehicleModel!: string;

  @Column({ name: 'vehicle_year', type: 'integer' })
  vehicleYear!: number;

  @Column({ type: 'jsonb' })
  items!: PurchaseItem[];

  @Column({ name: 'total_amount', type: 'decimal', precision: 10, scale: 2 })
  totalAmount!: number;

  @Column({ name: 'payment_method', type: 'enum', enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @Column({ name: 'delivery_method', type: 'enum', enum: DeliveryMethod })
  deliveryMethod!: DeliveryMethod;

  @Column({ name: 'payment_link', type: 'text', nullable: true })
  paymentLink?: string;

  @Column({ type: 'enum', enum: PurchaseStatus, default: PurchaseStatus.PENDENTE })
  status!: PurchaseStatus;

  @Column({ name: 'purchase_origin', type: 'enum', enum: PurchaseOrigin })
  purchaseOrigin!: PurchaseOrigin;

  @Column({ name: 'purchase_date', type: 'timestamp' })
  purchaseDate!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Methods
  isPending(): boolean {
    return this.status === PurchaseStatus.PENDENTE;
  }

  isPaid(): boolean {
    return this.status === PurchaseStatus.PAGO;
  }

  isCancelled(): boolean {
    return this.status === PurchaseStatus.CANCELADO;
  }

  isRefunded(): boolean {
    return this.status === PurchaseStatus.ESTORNADO;
  }

  canBeRefunded(): boolean {
    return this.isPaid() && !this.isRefunded();
  }
}
