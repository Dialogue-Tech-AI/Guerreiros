import { IDomainEvent } from './domain-event.interface';
import { UUID, VehicleBrand } from '../../types/common.types';

// Attendance Events
export class AttendanceCreatedEvent implements IDomainEvent {
  readonly eventName = 'AttendanceCreatedEvent';
  readonly occurredAt: Date;

  constructor(
    public readonly aggregateId: UUID,
    public readonly clientPhone: string,
    public readonly whatsappNumberId: UUID
  ) {
    this.occurredAt = new Date();
  }
}

export class BrandIdentifiedEvent implements IDomainEvent {
  readonly eventName = 'BrandIdentifiedEvent';
  readonly occurredAt: Date;

  constructor(
    public readonly aggregateId: UUID,
    public readonly brand: VehicleBrand
  ) {
    this.occurredAt = new Date();
  }
}

export class AttendanceRoutedEvent implements IDomainEvent {
  readonly eventName = 'AttendanceRoutedEvent';
  readonly occurredAt: Date;

  constructor(
    public readonly aggregateId: UUID,
    public readonly sellerId: UUID,
    public readonly supervisorId: UUID,
    public readonly brand: VehicleBrand
  ) {
    this.occurredAt = new Date();
  }
}

export class AttendanceAssumedEvent implements IDomainEvent {
  readonly eventName = 'AttendanceAssumedEvent';
  readonly occurredAt: Date;

  constructor(
    public readonly aggregateId: UUID,
    public readonly sellerId: UUID
  ) {
    this.occurredAt = new Date();
  }
}

export class AttendanceReturnedEvent implements IDomainEvent {
  readonly eventName = 'AttendanceReturnedEvent';
  readonly occurredAt: Date;

  constructor(
    public readonly aggregateId: UUID
  ) {
    this.occurredAt = new Date();
  }
}

export class AttendanceFinalizedEvent implements IDomainEvent {
  readonly eventName = 'AttendanceFinalizedEvent';
  readonly occurredAt: Date;

  constructor(
    public readonly aggregateId: UUID,
    public readonly finalizedBy: UUID
  ) {
    this.occurredAt = new Date();
  }
}

// Message Events
export class MessageReceivedEvent implements IDomainEvent {
  readonly eventName = 'MessageReceivedEvent';
  readonly occurredAt: Date;

  constructor(
    public readonly aggregateId: UUID,
    public readonly attendanceId: UUID,
    public readonly content: string
  ) {
    this.occurredAt = new Date();
  }
}

export class MessageSentEvent implements IDomainEvent {
  readonly eventName = 'MessageSentEvent';
  readonly occurredAt: Date;

  constructor(
    public readonly aggregateId: UUID,
    public readonly attendanceId: UUID,
    public readonly content: string
  ) {
    this.occurredAt = new Date();
  }
}
