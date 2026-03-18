import Joi from 'joi';

export interface ConnectionConfirmedDto {
  number_id: string;
  whatsapp_number: string; // Número real do WhatsApp conectado (ex: +5511999999999)
  connected: boolean;
}

export const connectionConfirmedDtoSchema = Joi.object<ConnectionConfirmedDto>({
  number_id: Joi.string().uuid().required().trim(),
  whatsapp_number: Joi.string().required().trim().pattern(/^\+?[1-9]\d{1,14}$/).messages({
    'string.pattern.base': 'WhatsApp number must be in E.164 format (e.g., +5511999999999)',
  }),
  connected: Joi.boolean().required(),
});
