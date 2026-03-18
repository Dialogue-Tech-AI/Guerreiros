export interface IQueue {
  /**
   * Publish message to queue
   */
  publish(queue: string, message: unknown): Promise<void>;

  /**
   * Consume messages from queue
   */
  consume(queue: string, callback: (message: unknown) => Promise<void>): Promise<void>;

  /**
   * Create queue if it doesn't exist
   */
  assertQueue(queue: string): Promise<void>;

  /**
   * Get queue message count
   */
  getMessageCount(queue: string): Promise<number>;

  /**
   * Purge queue
   */
  purgeQueue(queue: string): Promise<void>;

  /**
   * Close connection
   */
  disconnect(): Promise<void>;
}
