import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { UUID } from '../../../../shared/types/common.types';

@Entity('biblioteca_folders')
export class BibliotecaFolder {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: UUID | null;

  @ManyToOne('BibliotecaFolder', { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_id' })
  parent?: any | null;

  @OneToMany('BibliotecaFolder', 'parent')
  children?: any[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
