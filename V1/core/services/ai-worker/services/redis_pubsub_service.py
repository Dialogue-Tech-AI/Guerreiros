"""Redis Pub/Sub Service for Cache Invalidation"""
import asyncio
import redis.asyncio as redis
from typing import Callable, Dict, Optional
from utils.logger import logger
from config.settings import settings


class RedisPubSubService:
    """
    Redis Pub/Sub service for real-time cache invalidation
    Allows multiple ai-workers to receive cache invalidation events
    """
    
    CHANNEL_CONFIG_UPDATE = "ai:config:update"
    
    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.pubsub: Optional[redis.client.PubSub] = None
        self.subscribers: Dict[str, Callable] = {}
        self._listening_task: Optional[asyncio.Task] = None
        self._is_running = False
    
    async def connect(self):
        """Connect to Redis"""
        try:
            self.redis_client = redis.Redis(
                host=settings.redis_host,
                port=settings.redis_port,
                password=settings.redis_password,
                db=settings.redis_db,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_keepalive=True,
                retry_on_timeout=True,
            )
            
            # Test connection
            await self.redis_client.ping()
            logger.info(
                f"Redis connected successfully: {settings.redis_host}:{settings.redis_port}"
            )
            
            # Initialize pubsub
            self.pubsub = self.redis_client.pubsub()
            
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}", exc_info=True)
            raise
    
    async def disconnect(self):
        """Disconnect from Redis"""
        try:
            self._is_running = False
            
            # Cancel listening task
            if self._listening_task and not self._listening_task.done():
                self._listening_task.cancel()
                try:
                    await self._listening_task
                except asyncio.CancelledError:
                    pass
            
            # Close pubsub
            if self.pubsub:
                await self.pubsub.close()
            
            # Close redis connection
            if self.redis_client:
                await self.redis_client.close()
            
            logger.info("Redis disconnected")
        except Exception as e:
            logger.error(f"Error disconnecting from Redis: {e}", exc_info=True)
    
    async def subscribe(self, channel: str, callback: Callable):
        """
        Subscribe to a channel and register callback
        
        Args:
            channel: Redis channel name
            callback: Async function to call when message is received
        """
        if not self.pubsub:
            raise RuntimeError("Redis not connected. Call connect() first.")
        
        try:
            # Subscribe to channel
            await self.pubsub.subscribe(channel)
            
            # Register callback
            self.subscribers[channel] = callback
            
            logger.info(f"Subscribed to Redis channel: {channel}")
            
            # Start listening if not already running
            if not self._is_running:
                self._is_running = True
                self._listening_task = asyncio.create_task(self._listen())
                
        except Exception as e:
            logger.error(f"Error subscribing to channel {channel}: {e}", exc_info=True)
            raise
    
    async def _listen(self):
        """Listen for messages on subscribed channels"""
        logger.info("Redis Pub/Sub listener started")
        
        try:
            while self._is_running:
                try:
                    # Get message with timeout
                    message = await asyncio.wait_for(
                        self.pubsub.get_message(ignore_subscribe_messages=True),
                        timeout=1.0
                    )
                    
                    if message:
                        msg_type = message.get('type')
                        channel = message.get('channel') or message.get('pattern')
                        data = message.get('data')
                        
                        if msg_type == 'message' or msg_type == 'pmessage':
                            logger.info(
                                f"📨 Received Redis message on channel '{channel}': {data}",
                                extra={
                                    'channel': channel,
                                    'payload': data,
                                    'msg_type': msg_type
                                }
                            )
                            
                            # Handle pattern matches (function call updates)
                            if msg_type == 'pmessage' and channel and 'function_call' in channel:
                                # Extract tool name from channel: config:function_call:{toolName}:updated
                                if 'config:function_call:' in channel and ':updated' in channel:
                                    tool_name = channel.replace('config:function_call:', '').replace(':updated', '')
                                    callback_key = "config:function_call:*:updated"
                                    if callback_key in self.subscribers:
                                        callback = self.subscribers[callback_key]
                                        try:
                                            await callback(channel, tool_name)
                                        except Exception as e:
                                            logger.error(
                                                f"Error in function call callback: {e}",
                                                exc_info=True
                                            )
                            # Handle regular channel subscriptions
                            elif channel in self.subscribers:
                                callback = self.subscribers[channel]
                                try:
                                    await callback(channel, data)
                                except Exception as e:
                                    logger.error(
                                        f"Error in callback for channel {channel}: {e}",
                                        exc_info=True
                                    )
                            else:
                                logger.debug(f"No callback registered for channel: {channel}")
                    
                    # Small sleep to prevent busy loop
                    await asyncio.sleep(0.01)
                    
                except asyncio.TimeoutError:
                    # No message received, continue
                    continue
                except asyncio.CancelledError:
                    logger.info("Redis listener cancelled")
                    break
                except Exception as e:
                    logger.error(f"Error in Redis listener: {e}", exc_info=True)
                    await asyncio.sleep(1)  # Back off on error
                    
        except Exception as e:
            logger.error(f"Fatal error in Redis listener: {e}", exc_info=True)
        finally:
            logger.info("Redis Pub/Sub listener stopped")
    
    async def publish(self, channel: str, message: str):
        """
        Publish message to a channel
        
        Args:
            channel: Redis channel name
            message: Message to publish
        """
        if not self.redis_client:
            raise RuntimeError("Redis not connected. Call connect() first.")
        
        try:
            await self.redis_client.publish(channel, message)
            logger.info(f"Published to channel '{channel}': {message}")
        except Exception as e:
            logger.error(f"Error publishing to channel {channel}: {e}", exc_info=True)
            raise
    
    async def subscribe_to_config_updates(self, callback: Callable):
        """
        Convenience method to subscribe to config update events
        
        Args:
            callback: Async function to call when config is updated
        """
        await self.subscribe(self.CHANNEL_CONFIG_UPDATE, callback)
    
    async def subscribe_to_function_call_updates(self, callback: Callable):
        """
        Subscribe to function call prompt update events using pattern matching
        
        Args:
            callback: Async function to call when function call prompt is updated
                     Callback signature: (channel: str, tool_name: str)
        """
        if not self.pubsub:
            raise RuntimeError("Redis not connected. Call connect() first.")
        
        try:
            # Subscribe to pattern: config:function_call:*:updated
            await self.pubsub.psubscribe("config:function_call:*:updated")
            
            # Register callback with special handling
            self.subscribers["config:function_call:*:updated"] = callback
            
            logger.info("Subscribed to function call prompt updates (pattern: config:function_call:*:updated)")
            
            # Start listening if not already running
            if not self._is_running:
                self._is_running = True
                self._listening_task = asyncio.create_task(self._listen())
                
        except Exception as e:
            logger.error(f"Error subscribing to function call updates: {e}", exc_info=True)
            raise
    
    async def publish_config_update(self, config_key: str):
        """
        Convenience method to publish config update event
        
        Args:
            config_key: The config key that was updated (e.g., 'agent_prompt')
        """
        await self.publish(self.CHANNEL_CONFIG_UPDATE, config_key)


# Global instance
redis_pubsub_service = RedisPubSubService()
