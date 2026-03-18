import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../../types/common.types';
import { ForbiddenException } from '../../domain/exceptions/domain-exception';
import { AuthRequest } from './auth.middleware';

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new ForbiddenException('User not authenticated');
      }

      if (!allowedRoles.includes(req.user.role)) {
        throw new ForbiddenException('Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireSeller(req: AuthRequest, res: Response, next: NextFunction): void {
  requireRole(UserRole.SELLER, UserRole.SUPERVISOR, UserRole.ADMIN_GENERAL)(req, res, next);
}

export function requireSupervisor(req: AuthRequest, res: Response, next: NextFunction): void {
  requireRole(UserRole.SUPERVISOR, UserRole.ADMIN_GENERAL)(req, res, next);
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  requireRole(UserRole.ADMIN_GENERAL)(req, res, next);
}

export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  requireRole(UserRole.SUPER_ADMIN)(req, res, next);
}
