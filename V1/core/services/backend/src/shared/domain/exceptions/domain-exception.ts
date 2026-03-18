export class DomainException extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundException extends DomainException {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

export class UnauthorizedException extends DomainException {
  constructor(message: string = 'Unauthorized access') {
    super(message, 401);
  }
}

export class ForbiddenException extends DomainException {
  constructor(message: string = 'Access forbidden') {
    super(message, 403);
  }
}

export class BadRequestException extends DomainException {
  constructor(message: string = 'Bad request') {
    super(message, 400);
  }
}

export class ValidationException extends DomainException {
  public readonly errors: Record<string, string[]>;

  constructor(errors: Record<string, string[]>, message: string = 'Validation failed') {
    super(message, 422);
    this.errors = errors;
  }
}

export class ConflictException extends DomainException {
  constructor(message: string = 'Resource conflict') {
    super(message, 409);
  }
}

export class InternalServerException extends DomainException {
  constructor(message: string = 'Internal server error') {
    super(message, 500);
  }
}
