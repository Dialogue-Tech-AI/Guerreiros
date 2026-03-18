import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../../auth/domain/entities/user.entity';
import {
  WhatsAppAdapterType,
  AttendanceType,
  WhatsAppNumberType,
  ConnectionStatus,
  UUID,
} from '../../../../shared/types/common.types';

@Entity('whatsapp_numbers')
export class WhatsAppNumber {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ type: 'varchar', length: 80, unique: true })
  number!: string;

  @Column({ name: 'adapter_type', type: 'enum', enum: WhatsAppAdapterType })
  adapterType!: WhatsAppAdapterType;

  @Column({ name: 'handled_by', type: 'enum', enum: AttendanceType })
  handledBy!: AttendanceType;

  @Column({ name: 'number_type', type: 'enum', enum: WhatsAppNumberType })
  numberType!: WhatsAppNumberType;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  config?: Record<string, any>;

  @Column({ name: 'connection_status', type: 'enum', enum: ConnectionStatus, default: ConnectionStatus.DISCONNECTED })
  connectionStatus!: ConnectionStatus;

  @Column({ name: 'last_check_at', type: 'timestamp', nullable: true })
  lastCheckAt?: Date;

  @Column({ name: 'seller_id', type: 'uuid', nullable: true })
  sellerId?: UUID;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'seller_id' })
  seller?: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Methods
  isActive(): boolean {
    return this.active;
  }

  isConnected(): boolean {
    return this.connectionStatus === ConnectionStatus.CONNECTED;
  }

  isOfficialAdapter(): boolean {
    return this.adapterType === WhatsAppAdapterType.OFFICIAL;
  }

  isUnofficialAdapter(): boolean {
    return this.adapterType === WhatsAppAdapterType.UNOFFICIAL;
  }

  isPrimaryNumber(): boolean {
    return this.numberType === WhatsAppNumberType.PRIMARY;
  }

  isHandledByAI(): boolean {
    return this.handledBy === AttendanceType.AI;
  }

  updateConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatus = status;
    this.lastCheckAt = new Date();
  }
}
