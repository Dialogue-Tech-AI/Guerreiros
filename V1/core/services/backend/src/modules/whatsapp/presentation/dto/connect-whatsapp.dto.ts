import Joi from 'joi';

export interface ConnectWhatsAppDto {
  name: string;
  config?: Record<string, any>;
  /** When 'OFFICIAL', use phoneNumberId and accessToken (from Meta). */
  adapterType?: 'OFFICIAL' | 'UNOFFICIAL';
  phoneNumberId?: string;
  accessToken?: string;
  verifyToken?: string;
}

export const connectWhatsAppDtoSchema = Joi.object<ConnectWhatsAppDto>({
  name: Joi.string().required().trim().min(1),
  config: Joi.object().optional(),
  adapterType: Joi.string().valid('OFFICIAL', 'UNOFFICIAL').optional(),
  phoneNumberId: Joi.string().trim().optional(),
  accessToken: Joi.string().trim().optional(),
  verifyToken: Joi.string().trim().optional(),
});
