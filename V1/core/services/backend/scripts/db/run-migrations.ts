// Load environment variables FIRST, before any imports
import { loadEnv } from '../../src/config/load-env';

// Usa sempre o .env unificado na raiz com flags DEV/PROD
loadEnv();

// Now import after env is loaded
import 'reflect-metadata';
import { AppDataSource } from '../../src/shared/infrastructure/database/typeorm/config/database.config';
import { logger } from '../../src/shared/utils/logger';

async function runMigrations() {
  try {
    logger.info('Initializing database connection...');
    
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      logger.info('Database connected successfully');
    }

    logger.info('Running migrations...');
    
    // Check if baileys_credentials table exists
    const queryRunner = AppDataSource.createQueryRunner();
    const tableExists = await queryRunner.hasTable('baileys_credentials');
    await queryRunner.release();
    
    if (!tableExists) {
      logger.info('baileys_credentials table does not exist, running migrations...');
    } else {
      logger.info('baileys_credentials table already exists');
    }
    
    // Show pending migrations first
    const pendingMigrations = await AppDataSource.showMigrations();
    logger.info(`Pending migrations: ${pendingMigrations}`);
    
    const migrations = await AppDataSource.runMigrations();
    
    if (migrations.length > 0) {
      logger.info(`Successfully ran ${migrations.length} migration(s):`);
      migrations.forEach((migration) => {
        logger.info(`  - ${migration.name}`);
      });
    } else {
      logger.info('No pending migrations found');
      
      // List all migrations to help debug
      try {
        const allMigrations = await AppDataSource.migrations;
        logger.info(`Total migrations found: ${allMigrations.length}`);
        allMigrations.forEach((migration) => {
          logger.info(`  - ${migration.name || migration.constructor.name}`);
        });
      } catch (error) {
        logger.warn('Could not list migrations', { error });
      }
    }

    await AppDataSource.destroy();
    logger.info('Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration error:', error);
    process.exit(1);
  }
}

runMigrations();
