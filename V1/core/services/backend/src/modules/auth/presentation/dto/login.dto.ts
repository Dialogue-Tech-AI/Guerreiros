import Joi from 'joi';

export interface LoginDto {
  email: string;
  password: string;
}

export const loginDtoSchema = Joi.object<LoginDto>({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

export interface RefreshTokenDto {
  refreshToken: string;
}

export const refreshTokenDtoSchema = Joi.object<RefreshTokenDto>({
  refreshToken: Joi.string().required(),
});

export interface RegisterDto {
  name: string;
  email: string;
  password: string;
  role: string;
}

export const registerDtoSchema = Joi.object<RegisterDto>({
  name: Joi.string().min(3).max(255).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid('SELLER', 'SUPERVISOR', 'ADMIN_GENERAL', 'SUPER_ADMIN').required(),
});
