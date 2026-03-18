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
  AttendanceState,
  AttendanceType,
  OperationalState,
  AttendanceCaseType,
  PurchaseOrigin,
  VehicleBrand,
  UUID,
} from '../../../../shared/types/common.types';
import { User } from '../../../auth/domain/entities/user.entity';

@Entity('attendances')
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ name: 'client_phone', type: 'varchar', length: 20 })
  clientPhone!: string;

  @Column({ name: 'whatsapp_number_id', type: 'uuid' })
  whatsappNumberId!: UUID;

  @Column({ type: 'enum', enum: AttendanceState })
  state!: AttendanceState; // DEPRECATED: Será removido na migration, substituído por operationalState

  @Column({ name: 'operational_state', type: 'enum', enum: OperationalState, nullable: true })
  operationalState?: OperationalState;

  @Column({ name: 'handled_by', type: 'enum', enum: AttendanceType })
  handledBy!: AttendanceType;

  @Column({ name: 'is_finalized', type: 'boolean', default: false })
  isFinalized!: boolean;

  @Column({ name: 'is_attributed', type: 'boolean', default: true })
  isAttributed!: boolean;

  @Column({ name: 'attendance_type', type: 'enum', enum: AttendanceCaseType, nullable: true })
  attendanceType?: AttendanceCaseType;

  @Column({ name: 'purchase_origin', type: 'enum', enum: PurchaseOrigin, nullable: true })
  purchaseOrigin?: PurchaseOrigin;

  @Column({ name: 'purchase_date', type: 'timestamp', nullable: true })
  purchaseDate?: Date;

  @Column({ name: 'last_client_message_at', type: 'timestamp', nullable: true })
  lastClientMessageAt?: Date;

  @Column({ type: 'text', nullable: true })
  intention?: string;

  @Column({ name: 'related_attendance_id', type: 'uuid', nullable: true })
  relatedAttendanceId?: UUID;

  @ManyToOne(() => Attendance, { nullable: true })
  @JoinColumn({ name: 'related_attendance_id' })
  relatedAttendance?: Attendance;

  @Column({ name: 'vehicle_brand', type: 'enum', enum: VehicleBrand, nullable: true })
  vehicleBrand?: VehicleBrand;

  @Column({ name: 'seller_id', type: 'uuid', nullable: true })
  sellerId?: UUID;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'seller_id' })
  seller?: User;

  @Column({ name: 'supervisor_id', type: 'uuid', nullable: true })
  supervisorId?: UUID;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'supervisor_id' })
  supervisor?: User;

  @Column({ name: 'active_seller_id', type: 'uuid', nullable: true })
  activeSellerId?: UUID;

  @Column({ name: 'ai_context', type: 'jsonb', nullable: true })
  aiContext?: Record<string, any>;

  @Column({ name: 'intervention_type', type: 'varchar', length: 64, nullable: true })
  interventionType?: string;

  @Column({ name: 'intervention_data', type: 'jsonb', nullable: true })
  interventionData?: Record<string, unknown>;

  @Column({ name: 'seller_subdivision', type: 'varchar', length: 64, nullable: true })
  sellerSubdivision?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'routed_at', type: 'timestamp', nullable: true })
  routedAt?: Date;

  @Column({ name: 'finalized_at', type: 'timestamp', nullable: true })
  finalizedAt?: Date;

  @Column({ name: 'assumed_at', type: 'timestamp', nullable: true })
  assumedAt?: Date;

  @Column({ name: 'returned_at', type: 'timestamp', nullable: true })
  returnedAt?: Date;

  /** Timer de fechamento automático do balcão (quando expira, move para Fechados) */
  @Column({ name: 'balcao_closing_at', type: 'timestamp', nullable: true })
  balcaoClosingAt?: Date;

  /** Timer de fechamento automático do e-commerce (quando expira, move para Fechados) */
  @Column({ name: 'ecommerce_closing_at', type: 'timestamp', nullable: true })
  ecommerceClosingAt?: Date;

  /** Data até quando a IA está desativada para este atendimento (null = IA ativa) */
  @Column({ name: 'ai_disabled_until', type: 'timestamp', nullable: true })
  aiDisabledUntil?: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Methods (usando operationalState)
  isInTriagem(): boolean {
    return this.operationalState === OperationalState.TRIAGEM;
  }

  isAberto(): boolean {
    return this.operationalState === OperationalState.ABERTO;
  }

  isEmAtendimento(): boolean {
    return this.operationalState === OperationalState.EM_ATENDIMENTO;
  }

  isAguardandoCliente(): boolean {
    return this.operationalState === OperationalState.AGUARDANDO_CLIENTE;
  }

  isAguardandoVendedor(): boolean {
    return this.operationalState === OperationalState.AGUARDANDO_VENDEDOR;
  }

  isFechadoOperacional(): boolean {
    return this.operationalState === OperationalState.FECHADO_OPERACIONAL;
  }

  canBeFinalized(): boolean {
    return this.isFechadoOperacional() && !this.isFinalized;
  }

  isHandledByAI(): boolean {
    return this.handledBy === AttendanceType.AI;
  }

  isHandledByHuman(): boolean {
    return this.handledBy === AttendanceType.HUMAN;
  }

  isRouted(): boolean {
    return this.sellerId !== null && this.routedAt !== null;
  }

  canBeAssumedByHuman(): boolean {
    return this.isHandledByAI() && !this.isFechadoOperacional();
  }

  canBeReturnedToAI(): boolean {
    return this.isHandledByHuman() && !this.isFechadoOperacional();
  }
}
