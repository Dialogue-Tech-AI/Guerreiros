import { IDomainEvent, IEventBus, IEventHandler } from '../../domain/events/domain-event.interface';
import { logger } from '../../utils/logger';

export class EventBus implements IEventBus {
  private static instance: EventBus;
  private handlers: Map<string, IEventHandler<IDomainEvent>[]> = new Map();

  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  subscribe<T extends IDomainEvent>(eventName: string, handler: IEventHandler<T>): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }

    this.handlers.get(eventName)!.push(handler as IEventHandler<IDomainEvent>);
    logger.debug(`Event handler registered for event: ${eventName}`);
  }

  async publish(event: IDomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventName) || [];

    logger.debug(`Publishing event: ${event.eventName}`, {
      aggregateId: event.aggregateId,
      handlersCount: handlers.length,
    });

    for (const handler of handlers) {
      try {
        await handler.handle(event);
      } catch (error) {
        logger.error(`Error handling event ${event.eventName}:`, error);
        // Continue with other handlers even if one fails
      }
    }
  }

  async publishMany(events: IDomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  getHandlersCount(eventName: string): number {
    return (this.handlers.get(eventName) || []).length;
  }

  clear(): void {
    this.handlers.clear();
    logger.debug('All event handlers cleared');
  }
}

export const eventBus = EventBus.getInstance();
