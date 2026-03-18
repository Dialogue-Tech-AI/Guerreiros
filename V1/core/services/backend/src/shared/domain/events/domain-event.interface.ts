import { UUID } from '../../types/common.types';

export interface IDomainEvent {
  readonly eventName: string;
  readonly occurredAt: Date;
  readonly aggregateId: UUID;
}

export interface IEventHandler<T extends IDomainEvent> {
  handle(event: T): Promise<void>;
}

export interface IEventBus {
  publish(event: IDomainEvent): Promise<void>;
  publishMany(events: IDomainEvent[]): Promise<void>;
  subscribe<T extends IDomainEvent>(
    eventName: string,
    handler: IEventHandler<T>
  ): void;
}
