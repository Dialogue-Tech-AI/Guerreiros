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

@Entity('biblioteca_schemas')
export class BibliotecaSchema {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'folder_id', type: 'uuid', nullable: true })
  folderId!: UUID | null;

  @ManyToOne('BibliotecaFolder', { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'folder_id' })
  folder?: any | null;

  @Column({ type: 'text', nullable: true })
  definition?: string | null;

  @Column({ name: 'schema_type', type: 'varchar', length: 20, nullable: true })
  schemaType?: 'sem-tags' | 'com-tags' | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
