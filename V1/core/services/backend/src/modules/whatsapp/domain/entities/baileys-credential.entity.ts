import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UUID } from '../../../../shared/types/common.types';

@Entity('baileys_credentials')
export class BaileysCredential {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ name: 'whatsapp_number_id', type: 'uuid', unique: true })
  whatsappNumberId!: UUID;

  @Column({ name: 'credential_key', type: 'varchar', length: 255 })
  credentialKey!: string;

  @Column({ name: 'credential_value', type: 'text' })
  credentialValue!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
