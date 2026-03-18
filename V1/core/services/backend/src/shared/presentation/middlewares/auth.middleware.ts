import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../../../config/app.config';
import { UnauthorizedException } from '../../domain/exceptions/domain-exception';
import { TokenPayload } from '../../../modules/auth/application/services/auth.service';

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('No token provided');
    }

    const [bearer, token] = authHeader.split(' ');

    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid token format');
    }

    // Verify token
    const payload = jwt.verify(token, config.jwt.secret) as TokenPayload;

    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Attach user to request
    req.user = payload;

    next();
  } catch (error) {
    next(new UnauthorizedException('Invalid or expired token'));
  }
}
