import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole, UUID } from '../../../../shared/types/common.types';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: UUID;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'enum', enum: UserRole })
  role!: UserRole;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Methods
  isSeller(): boolean {
    return this.role === UserRole.SELLER;
  }

  isSupervisor(): boolean {
    return this.role === UserRole.SUPERVISOR;
  }

  isAdminGeneral(): boolean {
    return this.role === UserRole.ADMIN_GENERAL;
  }

  isSuperAdmin(): boolean {
    return this.role === UserRole.SUPER_ADMIN;
  }

  hasPermission(requiredRole: UserRole): boolean {
    const roleHierarchy = {
      [UserRole.SELLER]: 1,
      [UserRole.SUPERVISOR]: 2,
      [UserRole.ADMIN_GENERAL]: 3,
      [UserRole.SUPER_ADMIN]: 4,
    };

    return roleHierarchy[this.role] >= roleHierarchy[requiredRole];
  }
}
