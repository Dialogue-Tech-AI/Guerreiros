import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AppDataSource } from './shared/infrastructure/database/typeorm/config/database.config';
import { loadEnv } from './config/load-env';

// Load unified environment (.env) with DEV/PROD flags
loadEnv();

// Export for TypeORM CLI
export default AppDataSource;
