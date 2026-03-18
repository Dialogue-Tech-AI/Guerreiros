import { Router, Response, NextFunction } from 'express';
import { AuthService } from '../../application/services/auth.service';
import { UserRepository } from '../../infrastructure/repositories/user.repository';
import { AuthRequest } from '../../../../shared/presentation/middlewares/auth.middleware';
import { validateBody } from '../../../../shared/presentation/middlewares/validation.middleware';
import { loginDtoSchema, refreshTokenDtoSchema, registerDtoSchema } from '../dto/login.dto';
import { logger } from '../../../../shared/utils/logger';

export class AuthController {
  public router: Router;
  private authService: AuthService;

  constructor() {
    this.router = Router();
    this.authService = new AuthService(new UserRepository());
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.post('/login', validateBody(loginDtoSchema), this.login.bind(this));
    this.router.post('/refresh', validateBody(refreshTokenDtoSchema), this.refreshToken.bind(this));
    this.router.post('/register', validateBody(registerDtoSchema), this.register.bind(this));
    this.router.get('/me', this.getProfile.bind(this));
  }

  private async login(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await this.authService.login(email, password);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Login successful',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Login error:', error);
      next(error);
    }
  }

  private async refreshToken(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      const result = await this.authService.refreshToken(refreshToken);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Token refreshed successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Token refresh error:', error);
      next(error);
    }
  }

  private async register(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, email, password, role } = req.body;
      const user = await this.authService.register({ name, email, password, role });

      // Remove sensitive data
      const { passwordHash, ...userData } = user;

      res.status(201).json({
        success: true,
        data: userData,
        message: 'User registered successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Registration error:', error);
      next(error);
    }
  }

  private async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new Error('User not authenticated');
      }

      const userRepository = new UserRepository();
      const user = await userRepository.findById(req.user.sub);

      if (!user) {
        throw new Error('User not found');
      }

      // Remove sensitive data
      const { passwordHash, ...userData } = user;

      res.status(200).json({
        success: true,
        data: userData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Get profile error:', error);
      next(error);
    }
  }
}
