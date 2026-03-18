import path from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import config from '../../../../../config/app.config';
import { logger } from '../../../../utils/logger';
import fs from 'fs';

// Resolve migrations path for both local source tree and Docker runtime.
const getMigrationsPath = () => {
  const backendRoot = path.resolve(__dirname, '../../../../../../');
  const candidates = [
    // Docker runtime (we copy migrations into /app/shared/database/migrations)
    path.join(process.cwd(), 'shared', 'database', 'migrations'),
    // Local backend execution (core/services/backend -> core/shared)
    path.join(process.cwd(), '..', '..', 'shared', 'database', 'migrations'),
    // Backward compatibility with previous absolute runtime layout
    path.join(backendRoot, '..', '..', 'shared', 'database', 'migrations'),
  ];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing ?? candidates[0];
};

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.database,
  synchronize: config.database.synchronize, // NEVER true in production
  logging: config.database.logging,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
  entities: [
    // Em runtime (Docker): dist/ existe, src/ não. Usar path relativo a __dirname.
    // __dirname = dist/shared/infrastructure/database/typeorm/config → ../../../../../ = dist/
    __dirname + '/../../../../../modules/**/domain/entities/**/*.entity{.ts,.js}',
    __dirname + '/../entities/**/*.entity{.ts,.js}',
  ],
  migrations: [path.join(getMigrationsPath(), '**/*{.ts,.js}')],
  subscribers: [],
  migrationsTableName: 'migrations',
  extra: {
    max: 30, // Maximum number of connections
    min: 5,  // Minimum number of connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
};

export const AppDataSource = new DataSource(dataSourceOptions);

export async function initializeDatabase(): Promise<DataSource> {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      logger.info('Database connection established successfully');
      
      // Run pending migrations
      const pendingMigrations = await AppDataSource.showMigrations();
      if (pendingMigrations) {
        logger.info('Running pending migrations...');
        await AppDataSource.runMigrations();
        logger.info('Migrations completed successfully');
      }
    }
    return AppDataSource;
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      logger.info('Database connection closed');
    }
  } catch (error) {
    logger.error('Failed to close database connection:', error);
    throw error;
  }
}
