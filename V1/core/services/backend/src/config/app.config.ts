import { validateEnv, EnvironmentVariables } from './env.validation';

class AppConfig {
  private static instance: AppConfig;
  private env: EnvironmentVariables;

  private constructor() {
    this.env = validateEnv();
  }

  public static getInstance(): AppConfig {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig();
    }
    return AppConfig.instance;
  }

  // Application
  get app() {
    return {
      env: this.env.NODE_ENV,
      port: this.env.APP_PORT,
      name: this.env.APP_NAME,
      isDevelopment: this.env.NODE_ENV === 'development',
      isProduction: this.env.NODE_ENV === 'production',
      isTest: this.env.NODE_ENV === 'test',
    };
  }

  // Database
  get database() {
    return {
      host: this.env.DB_HOST,
      port: this.env.DB_PORT,
      username: this.env.DB_USER,
      password: this.env.DB_PASSWORD,
      database: this.env.DB_NAME,
      synchronize: this.env.DB_SYNC,
      logging: this.env.DB_LOGGING,
      ssl: this.env.DB_SSL,
    };
  }

  // Redis
  get redis() {
    return {
      host: this.env.REDIS_HOST,
      port: this.env.REDIS_PORT,
      password: this.env.REDIS_PASSWORD,
      db: this.env.REDIS_DB,
    };
  }

  // RabbitMQ
  get rabbitmq() {
    return {
      host: this.env.RABBITMQ_HOST,
      port: this.env.RABBITMQ_PORT,
      username: this.env.RABBITMQ_USER,
      password: this.env.RABBITMQ_PASS,
      vhost: this.env.RABBITMQ_VHOST,
      queues: {
        messages: this.env.RABBITMQ_QUEUE_MESSAGES,
        ai: this.env.RABBITMQ_QUEUE_AI,
        aiResponses: this.env.RABBITMQ_QUEUE_AI_RESPONSES,
        notifications: this.env.RABBITMQ_QUEUE_NOTIFICATIONS,
        functionCallProcess: 'function_call_process',
        functionCallResponse: 'function_call_response',
      },
    };
  }

  // MinIO (or S3 bucket names when USE_AWS_STORAGE=true)
  get minio() {
    const useS3 = this.env.NODE_ENV === 'production' && this.env.USE_AWS_STORAGE;
    return {
      endpoint: this.env.MINIO_ENDPOINT,
      port: this.env.MINIO_PORT,
      useSSL: this.env.MINIO_USE_SSL,
      accessKey: this.env.MINIO_ACCESS_KEY,
      secretKey: this.env.MINIO_SECRET_KEY,
      buckets: {
        attachments: useS3 && this.env.S3_BUCKET_ATTACHMENTS ? this.env.S3_BUCKET_ATTACHMENTS : this.env.MINIO_BUCKET_ATTACHMENTS,
        media: useS3 && this.env.S3_BUCKET_MEDIA ? this.env.S3_BUCKET_MEDIA : this.env.MINIO_BUCKET_MEDIA,
        logs: useS3 && this.env.S3_BUCKET_LOGS ? this.env.S3_BUCKET_LOGS : (this.env.MINIO_BUCKET_LOGS || 'logs'),
      },
    };
  }

  // JWT
  get jwt() {
    return {
      secret: this.env.JWT_SECRET,
      expiresIn: this.env.JWT_EXPIRES_IN,
      refreshExpiresIn: this.env.JWT_REFRESH_EXPIRES_IN,
    };
  }

  // OpenAI
  get openai() {
    return {
      apiKey: this.env.OPENAI_API_KEY,
      model: this.env.OPENAI_MODEL,
      temperature: this.env.OPENAI_TEMPERATURE,
      maxTokens: this.env.OPENAI_MAX_TOKENS,
      timeout: this.env.OPENAI_TIMEOUT,
    };
  }

  // WhatsApp Official
  get whatsappOfficial() {
    return {
      accessToken: this.env.WHATSAPP_META_ACCESS_TOKEN,
      phoneNumberId: this.env.WHATSAPP_META_PHONE_NUMBER_ID,
      appId: this.env.WHATSAPP_META_APP_ID,
      verifyToken: this.env.WHATSAPP_META_VERIFY_TOKEN,
    };
  }

  // WhatsApp Unofficial
  get whatsappUnofficial() {
    return {
      sessionPath: this.env.WHATSAPP_UNOFFICIAL_SESSION_PATH,
      pythonServiceUrl: this.env.WHATSAPP_PYTHON_SERVICE_URL || 'http://localhost:5000',
    };
  }

  // AWS
  get aws() {
    return {
      useCache: this.env.USE_AWS_CACHE,
      useQueue: this.env.USE_AWS_QUEUE,
      useStorage: this.env.USE_AWS_STORAGE,
      region: this.env.AWS_REGION,
      accessKeyId: this.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: this.env.AWS_SECRET_ACCESS_KEY,
      sqs: {
        queueAiMessagesUrl: this.env.SQS_QUEUE_AI_MESSAGES_URL,
        queueAiResponsesUrl: this.env.SQS_QUEUE_AI_RESPONSES_URL,
        queueFunctionCallProcessUrl: this.env.SQS_QUEUE_FUNCTION_CALL_PROCESS_URL,
        queueFunctionCallResponseUrl: this.env.SQS_QUEUE_FUNCTION_CALL_RESPONSE_URL,
      },
    };
  }

  // Security
  get security() {
    return {
      corsOrigin: this.env.CORS_ORIGIN,
      rateLimitWindowMs: this.env.RATE_LIMIT_WINDOW_MS,
      rateLimitMaxRequests: this.env.RATE_LIMIT_MAX_REQUESTS,
    };
  }

  // Logging
  get logging() {
    return {
      level: this.env.LOG_LEVEL,
      format: this.env.LOG_FORMAT,
    };
  }

  // Attendance
  get attendance() {
    return {
      inactiveTimeout: this.env.ATTENDANCE_INACTIVE_TIMEOUT,
      contextRetentionDays: this.env.ATTENDANCE_CONTEXT_RETENTION_DAYS,
      aiContextTtl: this.env.AI_CONTEXT_TTL,
    };
  }

  // Routing
  get routing() {
    return {
      strategy: this.env.ROUTING_STRATEGY,
      affinityRetentionDays: this.env.AFFINITY_RETENTION_DAYS,
    };
  }

  // Internal API
  get internal() {
    return {
      apiKey: this.env.INTERNAL_API_KEY || 'default-internal-key-change-in-production',
    };
  }

  // Qdrant
  get qdrant() {
    return {
      host: this.env.QDRANT_HOST || 'localhost',
      port: this.env.QDRANT_PORT || 6333,
    };
  }
}

export default AppConfig.getInstance();
