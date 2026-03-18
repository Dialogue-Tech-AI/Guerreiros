import { eventBus } from './event-bus.implementation';
import { IEventHandler, IDomainEvent } from '../../domain/events/domain-event.interface';

/**
 * Decorator to register event handlers automatically
 * 
 * Usage:
 * @EventHandler('AttendanceCreatedEvent')
 * class AttendanceCreatedHandler implements IEventHandler<AttendanceCreatedEvent> {
 *   async handle(event: AttendanceCreatedEvent): Promise<void> {
 *     // Handle the event
 *   }
 * }
 */
export function EventHandler(eventName: string | string[]) {
  return function <T extends { new (...args: any[]): IEventHandler<IDomainEvent> }>(
    constructor: T
  ) {
    const eventNames = Array.isArray(eventName) ? eventName : [eventName];
    const instance = new constructor();

    eventNames.forEach((name) => {
      eventBus.subscribe(name, instance);
    });

    return constructor;
  };
}
