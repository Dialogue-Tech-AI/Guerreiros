// Load environment variables FIRST (unified .env with DEV/PROD flags)
import { loadEnv } from '../../../services/backend/src/config/load-env';

loadEnv();

// Now import after env is loaded
import 'reflect-metadata';
import bcrypt from 'bcrypt';
import { AppDataSource } from '../../../services/backend/src/shared/infrastructure/database/typeorm/config/database.config';
import { User } from '../../../services/backend/src/modules/auth/domain/entities/user.entity';
import { UserRole } from '../../../services/backend/src/shared/types/common.types';
import { logger } from '../../../services/backend/src/shared/utils/logger';

async function seedSuperAdmin() {
  try {
    // Initialize database connection
    logger.info('Initializing database connection...');
    await AppDataSource.initialize();
    logger.info('Database connected successfully');

    const userRepository = AppDataSource.getRepository(User);

    // Check if Super Admin already exists
    const existingSuperAdmin = await userRepository.findOne({
      where: { role: UserRole.SUPER_ADMIN },
    });

    const passwordHash = await bcrypt.hash('0409L@ve', 10);

    if (existingSuperAdmin) {
      // Update existing Super Admin
      existingSuperAdmin.email = 'gabriel.dialogue@gmail.com';
      existingSuperAdmin.passwordHash = passwordHash;
      existingSuperAdmin.active = true;
      await userRepository.save(existingSuperAdmin);
      
      logger.info('✅ Super Admin updated successfully');
      logger.info('📧 Email: gabriel.dialogue@gmail.com');
      logger.info('🔑 Password: 0409L@ve');
      return;
    }

    // Create Super Admin
    const superAdmin = userRepository.create({
      name: 'Super Administrador',
      email: 'gabriel.dialogue@gmail.com',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      active: true,
    });

    await userRepository.save(superAdmin);

    logger.info('✅ Super Admin created successfully');
    logger.info('📧 Email: gabriel.dialogue@gmail.com');
    logger.info('🔑 Password: 0409L@ve');
    logger.info('⚠️  IMPORTANT: Change password after first login!');

  } catch (error) {
    logger.error('Error seeding Super Admin:', error);
    throw error;
  } finally {
    // Close database connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      logger.info('Database connection closed');
    }
  }
}

// Run seed
seedSuperAdmin()
  .then(() => {
    logger.info('Seed completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Seed failed:', error);
    process.exit(1);
  });
