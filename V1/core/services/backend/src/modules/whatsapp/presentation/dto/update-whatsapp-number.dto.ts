import Joi from 'joi';
import { WhatsAppNumberType } from '../../../../shared/types/common.types';

export interface UpdateWhatsAppNumberDto {
  numberType?: WhatsAppNumberType;
  sellerId?: string | null;
}

export const updateWhatsAppNumberDtoSchema = Joi.object<UpdateWhatsAppNumberDto>({
  numberType: Joi.string().valid('UNDEFINED', 'PRIMARY', 'SECONDARY').optional(),
  sellerId: Joi.alternatives().try(
    Joi.string().uuid(),
    Joi.string().valid(null, '')
  ).optional(),
}).custom((value, helpers) => {
  // SECONDARY requires sellerId
  if (value.numberType === 'SECONDARY' && (!value.sellerId || value.sellerId === '')) {
    return helpers.error('any.required', {
      message: 'sellerId é obrigatório quando numberType é SECONDARY',
    });
  }
  // PRIMARY e UNDEFINED não podem ter sellerId
  if ((value.numberType === 'PRIMARY' || value.numberType === 'UNDEFINED') && value.sellerId !== null && value.sellerId !== undefined && value.sellerId !== '') {
    return helpers.error('any.custom', {
      message: 'sellerId deve ser null quando numberType é PRIMARY ou UNDEFINED',
    });
  }
  return value;
});
