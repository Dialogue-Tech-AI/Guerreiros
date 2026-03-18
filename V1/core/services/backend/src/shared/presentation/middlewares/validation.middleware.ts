import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationException } from '../../domain/exceptions/domain-exception';

export function validateBody(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const errors: Record<string, string[]> = {};
        
        error.details.forEach((detail) => {
          const key = detail.path.join('.');
          if (!errors[key]) {
            errors[key] = [];
          }
          errors[key].push(detail.message);
        });

        throw new ValidationException(errors);
      }

      req.body = value;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateQuery(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { error, value } = schema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const errors: Record<string, string[]> = {};
        
        error.details.forEach((detail) => {
          const key = detail.path.join('.');
          if (!errors[key]) {
            errors[key] = [];
          }
          errors[key].push(detail.message);
        });

        throw new ValidationException(errors);
      }

      req.query = value;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateParams(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { error, value } = schema.validate(req.params, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const errors: Record<string, string[]> = {};
        
        error.details.forEach((detail) => {
          const key = detail.path.join('.');
          if (!errors[key]) {
            errors[key] = [];
          }
          errors[key].push(detail.message);
        });

        throw new ValidationException(errors);
      }

      req.params = value;
      next();
    } catch (error) {
      next(error);
    }
  };
}
