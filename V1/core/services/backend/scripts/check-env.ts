/**
 * Script para verificar qual banco/filas estão sendo usados (local vs produção)
 * Uso: npx ts-node scripts/check-env.ts
 */
import { loadEnv } from '../src/config/load-env';

loadEnv();

const dbHost = process.env.DB_HOST || '';
const redisHost = process.env.REDIS_HOST || '';
const rabbitHost = process.env.RABBITMQ_HOST || '';
const isRds = dbHost.includes('rds.amazonaws.com');
const isProdRedis = redisHost.includes('cache.amazonaws.com');

console.log('\n=== VERIFICAÇÃO DE AMBIENTE (igual ao backend) ===\n');
console.log('IS_PRODUCTION:', process.env.IS_PRODUCTION);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('');
console.log('DB_HOST:', dbHost);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('REDIS_HOST:', redisHost);
console.log('RABBITMQ_HOST:', rabbitHost);
console.log('RABBITMQ_QUEUE_AI:', process.env.RABBITMQ_QUEUE_AI);
console.log('');
console.log('Usa RDS (produção)?', isRds ? 'SIM - CUIDADO!' : 'NÃO - local');
console.log('Usa Redis produção?', isProdRedis ? 'SIM - CUIDADO!' : 'NÃO - local');
console.log('');
