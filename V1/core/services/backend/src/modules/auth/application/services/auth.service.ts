// @ts-nocheck
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../../domain/entities/user.entity';
import { IAuthRepository } from '../../domain/interfaces/auth-repository.interface';
import { UnauthorizedException, BadRequestException } from '../../../../shared/domain/exceptions/domain-exception';
import config from '../../../../config/app.config';
import { logger } from '../../../../shared/utils/logger';
import { UUID, UserRole } from '../../../../shared/types/common.types';

export interface LoginResponse {
  user: {
    id: UUID;
    name: string;
    email: string;
    role: UserRole;
  };
  accessToken: string;
  refreshToken: string;
}

export interface TokenPayload {
  sub: UUID;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
}

export class AuthService {
  constructor(private readonly authRepository: IAuthRepository) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      // Find user
      const user = await this.authRepository.findByEmail(email);
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Check if user is active
      if (!user.active) {
        throw new UnauthorizedException('User account is inactive');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Generate tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      logger.info(`User ${user.email} logged in successfully`);

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        accessToken,
        refreshToken,
      };
    } catch (error) {
      logger.error('Login error:', error);
      throw error;
    }
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      // Verify refresh token
      const payload = jwt.verify(refreshToken, config.jwt.secret) as TokenPayload;

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      // Get user
      const user = await this.authRepository.findById(payload.sub);
      if (!user || !user.active) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Generate new access token
      const accessToken = this.generateAccessToken(user);

      return { accessToken };
    } catch (error) {
      logger.error('Token refresh error:', error);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async register(data: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
  }): Promise<User> {
    try {
      // Check if email already exists
      const existingUser = await this.authRepository.findByEmail(data.email);
      if (existingUser) {
        throw new BadRequestException('Email already in use');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(data.password, 10);

      // Create user
      const user = await this.authRepository.create({
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role,
        active: true,
      });

      logger.info(`User ${user.email} registered successfully`);

      return user;
    } catch (error) {
      logger.error('Registration error:', error);
      throw error;
    }
  }

  async verifyToken(token: string): Promise<TokenPayload> {
    try {
      const payload = jwt.verify(token, config.jwt.secret) as TokenPayload;
      return payload;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private generateAccessToken(user: User): string {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });
  }

  private generateRefreshToken(user: User): string {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.refreshExpiresIn,
    });
  }
}
