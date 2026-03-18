export interface ICache {
  /**
   * Get value from cache
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set value in cache
   */
  set(key: string, value: unknown, ttl?: number): Promise<void>;

  /**
   * Delete value from cache
   */
  delete(key: string): Promise<void>;

  /**
   * Check if key exists in cache
   */
  exists(key: string): Promise<boolean>;

  /**
   * Set expiration time for a key
   */
  expire(key: string, seconds: number): Promise<void>;

  /**
   * Get multiple values
   */
  mget<T>(...keys: string[]): Promise<(T | null)[]>;

  /**
   * Set multiple values
   */
  mset(keyValues: Record<string, unknown>, ttl?: number): Promise<void>;

  /**
   * Increment value
   */
  increment(key: string, by?: number): Promise<number>;

  /**
   * Decrement value
   */
  decrement(key: string, by?: number): Promise<number>;

  /**
   * Get keys matching pattern
   */
  keys(pattern: string): Promise<string[]>;

  /**
   * Clear all keys
   */
  clear(): Promise<void>;

  /**
   * Publish message to channel
   */
  publish(channel: string, message: string): Promise<void>;

  /**
   * Subscribe to channel
   */
  subscribe(channel: string, callback: (message: string) => void): Promise<void>;

  /**
   * Unsubscribe from channel
   */
  unsubscribe(channel: string): Promise<void>;

  /**
   * Close connection
   */
  disconnect(): Promise<void>;
}
