// Load environment variables FIRST, before any imports
import { loadEnv } from './config/load-env';

// Sempre carregar o arquivo .env único na raiz.
// A escolha entre configuração de desenvolvimento ou produção
// passa a ser feita por flags booleanas dentro do próprio .env (IS_PRODUCTION).
loadEnv();

// Now import after env is loaded
import 'reflect-metadata';
import express, { Application } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import config from './config/app.config';
import { logger } from './shared/utils/logger';
import { InfrastructureFactory } from './shared/infrastructure/factories/infrastructure.factory';
import { S3LogTransport } from './shared/utils/s3-log.transport';

// Add S3/MinIO log transport: MinIO in dev, S3 in prod (when USE_AWS_STORAGE)
try {
  const storage = InfrastructureFactory.createStorage();
  const bucket = config.minio.buckets.logs;
  logger.add(new S3LogTransport({ storage, bucket }));
} catch (err) {
  console.warn('[Logger] Could not add S3/MinIO transport:', err);
}
import { initializeDatabase } from './shared/infrastructure/database/typeorm/config/database.config';
import { AppModule } from './app.module';
import { socketService } from './shared/infrastructure/socket/socket.service';
import { whatsappManagerService } from './modules/whatsapp/application/services/whatsapp-manager.service';
import { redisService } from './shared/infrastructure/redis/redis.service';

class Server {
  private app: Application;
  private httpServer: ReturnType<typeof createServer>;
  private port: number;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.port = config.app.port;
    
    // Initialize Socket.IO
    this.initializeSocketIO();
    
    this.initializeMiddlewares();
    this.initializeRoutes();
  }

  /** Build CORS allowed list and checker (any subdomain of dialoguetech.com.br + localhost + config). */
  private getCorsConfig(): { origins: string[]; isAllowed: (origin: string) => boolean } {
    const corsOrigins = (config.security.corsOrigin || '')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    const defaultOrigins = [
      'https://alteseai-app.dialoguetech.com.br',
      'https://alteseai.dialoguetech.com.br',
      'http://localhost:5173',
      'http://localhost:3000',
    ];
    const origins = [...new Set([...corsOrigins, ...defaultOrigins])];
    const isAllowed = (origin: string): boolean => {
      if (!origin) return false;
      if (origins.includes(origin)) return true;
      try {
        const host = new URL(origin).hostname;
        if (host === 'localhost') return true;
        if (host === 'dialoguetech.com.br' || host.endsWith('.dialoguetech.com.br')) return true;
      } catch {
        // ignore invalid URL
      }
      return false;
    };
    return { origins, isAllowed };
  }

  private initializeSocketIO(): void {
    const { origins, isAllowed } = this.getCorsConfig();

    const io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: (origin, callback) => {
          if (!origin || isAllowed(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'), false);
          }
        },
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: true,
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'X-Requested-With',
          'Accept',
          'Origin',
        ],
      },
      transports: ['websocket', 'polling'],
      allowEIO3: true,
    });

    // Register Socket.IO instance in service
    socketService.setIO(io);

    // Socket.IO connection handling
    io.on('connection', (socket) => {
      logger.info('Socket.IO client connected', {
        socketId: socket.id,
      });

      // Handle authentication (optional - can be added later)
      socket.on('authenticate', (data: { token?: string }) => {
        // TODO: Verify JWT token and associate socket with user
        logger.debug('Socket authentication request', {
          socketId: socket.id,
        });
      });

      // Handle room joining (for filtering events)
      socket.on('join_room', (room: string) => {
        socket.join(room);
        logger.info('Socket joined room', {
          socketId: socket.id,
          room,
        });
      });

      socket.on('leave_room', (room: string) => {
        socket.leave(room);
        logger.info('Socket left room', {
          socketId: socket.id,
          room,
        });
      });

      socket.on('disconnect', () => {
        logger.info('Socket.IO client disconnected', {
          socketId: socket.id,
        });
      });
    });

    logger.info('Socket.IO initialized', {
      allowedOrigins: origins,
    });
  }

  private initializeMiddlewares(): void {
    // CORS must be configured FIRST, before any other middleware
    const { origins: allAllowedOrigins, isAllowed } = this.getCorsConfig();

    logger.info('CORS configuration', {
      allowedOrigins: allAllowedOrigins,
      corsOriginConfig: config.security.corsOrigin,
    });
    
    // Handle OPTIONS (preflight) requests FIRST - deve responder antes de qualquer outro middleware
    this.app.use((req, res, next) => {
      if (req.method === 'OPTIONS') {
        const origin = req.headers.origin;
        if (!origin) {
          return res.sendStatus(204);
        }
        if (isAllowed(origin)) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
          res.setHeader('Access-Control-Allow-Credentials', 'true');
          res.setHeader('Access-Control-Max-Age', '86400');
          return res.sendStatus(204);
        }
        // Mesmo ao bloquear, incluir Allow-Origin para o browser poder ler a resposta
        res.setHeader('Access-Control-Allow-Origin', origin);
        return res.sendStatus(403);
      }
      next();
    });
    
    // Add CORS headers to all responses (including errors) - after OPTIONS handler
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      
      if (origin && isAllowed(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
      } else if (!origin) {
        // Allow requests with no origin (like mobile apps or Postman)
        // Note: When credentials: true, we can't use '*', but it's OK if there's no origin
        res.header('Access-Control-Allow-Origin', '*');
      }
      
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
      res.header('Access-Control-Expose-Headers', 'Content-Range, X-Content-Range');
      
      next();
    });
    
    this.app.use(
      cors({
        origin: (origin, callback) => {
          // Allow requests with no origin (like mobile apps or curl requests)
          if (!origin) {
            logger.debug('CORS: Request with no origin, allowing');
            return callback(null, true);
          }
          
          // Log all CORS requests for debugging
          logger.debug('CORS: Checking origin', { origin, allowedOrigins: allAllowedOrigins });
          
          if (isAllowed(origin)) {
            logger.debug('CORS: Origin allowed', { origin });
            return callback(null, true);
          }
          logger.warn('CORS: Origin blocked', { origin, allowedOrigins: allAllowedOrigins });
          callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'X-Requested-With',
          'Accept',
          'Origin',
          'Access-Control-Request-Method',
          'Access-Control-Request-Headers',
        ],
        exposedHeaders: ['Content-Range', 'X-Content-Range'],
        preflightContinue: false,
        optionsSuccessStatus: 204,
      })
    );

    // Security - Configure helmet to allow CORS (after CORS middleware)
    this.app.use(
      helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: false,
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https:'],
          },
        },
      })
    );

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    logger.info('Middlewares initialized');
  }

  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: config.app.env,
        uptime: process.uptime(),
      });
    });

    // API info
    this.app.get('/api', (req, res) => {
      res.json({
        message: 'Altese Autopeças API',
        version: '1.0.0',
        environment: config.app.env,
      });
    });

    // Initialize app module (registers all routes)
    new AppModule(this.app);

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        statusCode: 404,
        message: 'Route not found',
        timestamp: new Date().toISOString(),
      });
    });

    logger.info('Routes initialized');
  }

  public async start(): Promise<void> {
    try {
      // Initialize database
      await initializeDatabase();

      // Initialize Redis for cache and pub/sub
      try {
        await redisService.connect();
        logger.info('✅ Redis service initialized for cache invalidation');
        if (redisService.isConnected()) {
          logger.info('✅ Redis conectado - registrando subscription para attendance:intervention-assigned');
          await redisService.subscribe(
            'attendance:intervention-assigned',
            (raw) => {
              try {
                logger.info('📨 Mensagem recebida no canal attendance:intervention-assigned', { raw });
                const payload = JSON.parse(raw);
                logger.info('📤 Emitindo attendance:moved-to-intervention via Socket.IO para supervisors', {
                  attendanceId: payload.attendanceId,
                  interventionType: payload.interventionType,
                  room: 'supervisors',
                });
                socketService.emitToRoom('supervisors', 'attendance:moved-to-intervention', payload);
                logger.info('✅ Evento Socket.IO emitido com sucesso', {
                  event: 'attendance:moved-to-intervention',
                  attendanceId: payload.attendanceId,
                });
              } catch (e: any) {
                logger.error('❌ Erro ao processar mensagem Redis intervention', { 
                  raw, 
                  error: e?.message,
                  stack: e?.stack,
                });
              }
            }
          );
          logger.info('✅ Subscription registrado com sucesso para attendance:intervention-assigned');
        } else {
          logger.warn('⚠️ Redis conectado mas isConnected() retornou false');
        }
      } catch (error: any) {
        logger.warn('Redis service unavailable - cache invalidation will use TTL fallback', {
          error: error.message,
        });
      }

      // Start AI Response Consumer
      const { AIResponseConsumer } = await import('./modules/ai/infrastructure/consumers/ai-response.consumer');
      const aiResponseConsumer = new AIResponseConsumer();
      aiResponseConsumer.start().catch((error) => {
        logger.error('Error starting AI Response Consumer', {
          error: error.message,
        });
      });

      // Start Function Call Processor Worker
      const { FunctionCallProcessorWorker } = await import('./modules/ai/workers/function-call-processor.worker');
      const functionCallProcessorWorker = new FunctionCallProcessorWorker();
      functionCallProcessorWorker.start().catch((error) => {
        logger.error('Error starting Function Call Processor Worker', {
          error: error.message,
        });
      });

      // Auto-reconnect WhatsApp numbers that were connected before restart
      // This runs in background so it doesn't block server startup
      whatsappManagerService.reconnectAllNumbers().catch((error) => {
        logger.error('Error during WhatsApp auto-reconnect', {
          error: error.message,
        });
      });

      // Start background jobs
      const { InactivityCheckJob } = await import('./modules/attendance/infrastructure/jobs/inactivity-check.job');
      const { TimerCheckJob } = await import('./modules/attendance/infrastructure/jobs/timer-check.job');
      const { AutoFinalizeJob } = await import('./modules/attendance/infrastructure/jobs/auto-finalize.job');
      
      const inactivityJob = new InactivityCheckJob();
      inactivityJob.start();
      logger.info('✅ Inactivity check job started (runs every 15 minutes)');

      // Timer check job runs more frequently (every 1 minute) to check e-commerce and balcão timers
      const timerCheckJob = new TimerCheckJob();
      timerCheckJob.start();
      logger.info('✅ Timer check job started (runs every 1 minute)');

      const autoFinalizeJob = new AutoFinalizeJob();
      autoFinalizeJob.start();
      logger.info('✅ Auto-finalize job started (runs daily)');

      // Start HTTP server (with Socket.IO)
      this.httpServer.listen(this.port, () => {
        logger.info(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║        🚗 Altese Autopeças - Sistema de Atendimento       ║
║                                                           ║
║  Server running on: http://localhost:${this.port}              ║
║  Environment: ${config.app.env.toUpperCase().padEnd(37)} ║
║  Health check: http://localhost:${this.port}/health          ║
║  API Docs: http://localhost:${this.port}/api                 ║
║  Socket.IO: ws://localhost:${this.port}                       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
        `);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  public getApp(): Application {
    return this.app;
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Rejection:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  await redisService.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  await redisService.disconnect();
  process.exit(0);
});

// Start server
const server = new Server();
server.start();

export default server.getApp();
