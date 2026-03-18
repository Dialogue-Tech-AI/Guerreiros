import Joi from 'joi';

export interface WebhookMessageDto {
  from_number: string;
  to_number: string;
  message: string;
  message_id: string;
  timestamp: string;
  message_type?: string;
  media_url?: string;
}

export const webhookMessageDtoSchema = Joi.object<WebhookMessageDto>({
  from_number: Joi.string().required().trim(),
  to_number: Joi.string().required().trim(),
  message: Joi.string().required().trim(),
  message_id: Joi.string().required().trim(),
  timestamp: Joi.string().required().trim(),
  message_type: Joi.string().optional().trim(),
  media_url: Joi.string().optional().uri().trim(),
});
