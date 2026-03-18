import Joi from 'joi';

export interface EnvironmentVariables {
  // Application
  NODE_ENV: 'development' | 'production' | 'test';
  APP_PORT: number;
  APP_NAME: string;

  // Database
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  DB_SYNC: boolean;
  DB_LOGGING: boolean;
  DB_SSL?: boolean;

  // Redis
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  REDIS_DB: number;

  // RabbitMQ
  RABBITMQ_HOST: string;
  RABBITMQ_PORT: number;
  RABBITMQ_USER: string;
  RABBITMQ_PASS: string;
  RABBITMQ_VHOST: string;
  RABBITMQ_QUEUE_MESSAGES: string;
  RABBITMQ_QUEUE_AI: string;
  RABBITMQ_QUEUE_AI_RESPONSES: string;
  RABBITMQ_QUEUE_NOTIFICATIONS: string;

  // MinIO
  MINIO_ENDPOINT: string;
  MINIO_PORT: number;
  MINIO_USE_SSL: boolean;
  MINIO_ACCESS_KEY: string;
  MINIO_SECRET_KEY: string;
  MINIO_BUCKET_ATTACHMENTS: string;
  MINIO_BUCKET_MEDIA: string;

  // JWT
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;

  // OpenAI
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  OPENAI_TEMPERATURE: number;
  OPENAI_MAX_TOKENS: number;
  OPENAI_TIMEOUT: number;

  // WhatsApp Official
  WHATSAPP_META_ACCESS_TOKEN?: string;
  WHATSAPP_META_PHONE_NUMBER_ID?: string;
  WHATSAPP_META_APP_ID?: string;
  WHATSAPP_META_VERIFY_TOKEN?: string;

  // WhatsApp Unofficial
  WHATSAPP_UNOFFICIAL_SESSION_PATH: string;
  WHATSAPP_PYTHON_SERVICE_URL?: string;

  // AWS (Production only)
  USE_AWS_CACHE?: boolean;
  USE_AWS_QUEUE?: boolean;
  USE_AWS_STORAGE?: boolean;
  AWS_REGION?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  SQS_QUEUE_AI_MESSAGES_URL?: string;
  SQS_QUEUE_AI_RESPONSES_URL?: string;
  SQS_QUEUE_FUNCTION_CALL_PROCESS_URL?: string;
  SQS_QUEUE_FUNCTION_CALL_RESPONSE_URL?: string;
  S3_BUCKET_MEDIA?: string;
  S3_BUCKET_ATTACHMENTS?: string;
  S3_BUCKET_LOGS?: string;
  MINIO_BUCKET_LOGS?: string;

  // Security
  CORS_ORIGIN: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;

  // Logging
  LOG_LEVEL: string;
  LOG_FORMAT: string;

  // Attendance Configuration
  ATTENDANCE_INACTIVE_TIMEOUT: number;
  ATTENDANCE_CONTEXT_RETENTION_DAYS: number;
  AI_CONTEXT_TTL: number;

  // Routing Configuration
  ROUTING_STRATEGY: string;
  AFFINITY_RETENTION_DAYS: number;

  // Internal API
  INTERNAL_API_KEY?: string;

  // Qdrant Vector DB
  QDRANT_HOST?: string;
  QDRANT_PORT?: number;
}

export const validationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  APP_PORT: Joi.number().default(3000),
  APP_NAME: Joi.string().default('Altese Autopeças'),

  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SYNC: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  DB_SSL: Joi.boolean().optional().default(false),

  // Redis
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().default(0),

  // RabbitMQ
  RABBITMQ_HOST: Joi.string().required(),
  RABBITMQ_PORT: Joi.number().default(5672),
  RABBITMQ_USER: Joi.string().required(),
  RABBITMQ_PASS: Joi.string().required(),
  RABBITMQ_VHOST: Joi.string().default('/'),
  RABBITMQ_QUEUE_MESSAGES: Joi.string().default('altese-messages'),
  RABBITMQ_QUEUE_AI: Joi.string().default('ai-messages'),
  RABBITMQ_QUEUE_AI_RESPONSES: Joi.string().default('ai-responses'),
  RABBITMQ_QUEUE_NOTIFICATIONS: Joi.string().default('altese-notifications'),

  // MinIO
  MINIO_ENDPOINT: Joi.string().required(),
  MINIO_PORT: Joi.number().default(9000),
  MINIO_USE_SSL: Joi.boolean().default(false),
  MINIO_ACCESS_KEY: Joi.string().required(),
  MINIO_SECRET_KEY: Joi.string().required(),
  MINIO_BUCKET_ATTACHMENTS: Joi.string().default('attachments'),
  MINIO_BUCKET_MEDIA: Joi.string().default('media'),

  // JWT
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('1d'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // OpenAI
  OPENAI_API_KEY: Joi.string().required(),
  OPENAI_MODEL: Joi.string().default('gpt-4'),
  OPENAI_TEMPERATURE: Joi.number().default(0.7),
  OPENAI_MAX_TOKENS: Joi.number().default(1000),
  OPENAI_TIMEOUT: Joi.number().default(30000),

  // WhatsApp Official
  WHATSAPP_META_ACCESS_TOKEN: Joi.string().optional().allow(''),
  WHATSAPP_META_PHONE_NUMBER_ID: Joi.string().optional().allow(''),
  WHATSAPP_META_APP_ID: Joi.string().optional().allow(''),
  WHATSAPP_META_VERIFY_TOKEN: Joi.string().optional().allow(''),

  // WhatsApp Unofficial
  WHATSAPP_UNOFFICIAL_SESSION_PATH: Joi.string().default('./sessions'),
  WHATSAPP_PYTHON_SERVICE_URL: Joi.string().optional().allow('').default('http://localhost:5000'),

  // AWS
  USE_AWS_CACHE: Joi.boolean().optional().default(false),
  USE_AWS_QUEUE: Joi.boolean().optional().default(false),
  USE_AWS_STORAGE: Joi.boolean().optional().default(false),
  AWS_REGION: Joi.string().optional().allow(''),
  AWS_ACCESS_KEY_ID: Joi.string().optional().allow(''),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional().allow(''),
  SQS_QUEUE_AI_MESSAGES_URL: Joi.string().optional().allow(''),
  SQS_QUEUE_AI_RESPONSES_URL: Joi.string().optional().allow(''),
  SQS_QUEUE_FUNCTION_CALL_PROCESS_URL: Joi.string().optional().allow(''),
  SQS_QUEUE_FUNCTION_CALL_RESPONSE_URL: Joi.string().optional().allow(''),
  S3_BUCKET_MEDIA: Joi.string().optional().allow(''),
  S3_BUCKET_ATTACHMENTS: Joi.string().optional().allow(''),
  S3_BUCKET_LOGS: Joi.string().optional().allow(''),
  MINIO_BUCKET_LOGS: Joi.string().optional().allow(''),

  // Security
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),

  // Logging
  LOG_LEVEL: Joi.string().default('info'),
  LOG_FORMAT: Joi.string().default('json'),

  // Attendance Configuration
  ATTENDANCE_INACTIVE_TIMEOUT: Joi.number().default(86400000),
  ATTENDANCE_CONTEXT_RETENTION_DAYS: Joi.number().default(7),
  AI_CONTEXT_TTL: Joi.number().default(604800),

  // Routing Configuration
  ROUTING_STRATEGY: Joi.string().default('round-robin'),
  AFFINITY_RETENTION_DAYS: Joi.number().default(90),

  // Internal API (optional - only needed when AI Worker is enabled)
  INTERNAL_API_KEY: Joi.string().optional().allow(''),

  // Qdrant Vector DB (optional - only needed when AI Worker is enabled)
  QDRANT_HOST: Joi.string().optional().default('localhost'),
  QDRANT_PORT: Joi.number().optional().default(6333),
});

export function validateEnv(): EnvironmentVariables {
  const { error, value } = validationSchema.validate(process.env, {
    allowUnknown: true,
    abortEarly: false,
  });

  if (error) {
    throw new Error(`Environment validation error: ${error.message}`);
  }

  const env = value as EnvironmentVariables;

  // When using AWS queue in production, SQS queue URLs are required
  if (env.NODE_ENV === 'production' && env.USE_AWS_QUEUE) {
    if (!env.SQS_QUEUE_AI_MESSAGES_URL || !env.SQS_QUEUE_AI_RESPONSES_URL) {
      throw new Error(
        'When USE_AWS_QUEUE=true in production, SQS_QUEUE_AI_MESSAGES_URL and SQS_QUEUE_AI_RESPONSES_URL must be set'
      );
    }
    if (!env.AWS_REGION?.trim()) {
      throw new Error('When USE_AWS_QUEUE=true, AWS_REGION must be set');
    }
  }

  // When using AWS storage in production, S3 bucket names are required
  if (env.NODE_ENV === 'production' && env.USE_AWS_STORAGE) {
    if (!env.S3_BUCKET_MEDIA?.trim() || !env.S3_BUCKET_ATTACHMENTS?.trim()) {
      throw new Error(
        'When USE_AWS_STORAGE=true in production, S3_BUCKET_MEDIA and S3_BUCKET_ATTACHMENTS must be set'
      );
    }
    if (!env.AWS_REGION?.trim()) {
      throw new Error('When USE_AWS_STORAGE=true, AWS_REGION must be set');
    }
  }

  return env;
}
