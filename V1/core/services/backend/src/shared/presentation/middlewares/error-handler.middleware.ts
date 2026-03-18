import { Request, Response, NextFunction } from 'express';
import { DomainException, ValidationException } from '../../domain/exceptions/domain-exception';
import { logger } from '../../utils/logger';
import config from '../../../config/app.config';

export function errorHandlerMiddleware(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Ensure CORS headers are set even on errors (same rules as main CORS)
  const origin = req.headers.origin as string | undefined;
  if (origin) {
    const allowed = [
      'https://alteseai-app.dialoguetech.com.br',
      'https://alteseai.dialoguetech.com.br',
      'http://localhost:5173',
      'http://localhost:3000',
    ];
    let ok = allowed.includes(origin);
    if (!ok) {
      try {
        const host = new URL(origin).hostname;
        ok = host === 'localhost' || host === 'dialoguetech.com.br' || host.endsWith('.dialoguetech.com.br');
      } catch {
        // ignore
      }
    }
    if (ok) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    }
  }
  
  // Log error
  logger.error('Error caught by error handler:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    origin,
  });

  // Handle domain exceptions
  if (error instanceof ValidationException) {
    res.status(error.statusCode).json({
      success: false,
      statusCode: error.statusCode,
      message: error.message,
      errors: error.errors,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (error instanceof DomainException) {
    res.status(error.statusCode).json({
      success: false,
      statusCode: error.statusCode,
      message: error.message,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      statusCode: 401,
      message: 'Invalid or expired token',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle unknown errors
  const statusCode = 500;
  const message = config.app.isDevelopment ? error.message : 'Internal server error';

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    timestamp: new Date().toISOString(),
    ...(config.app.isDevelopment && { stack: error.stack }),
  });
}
