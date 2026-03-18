"""PostgreSQL async client"""
import asyncpg
from config.settings import settings
from utils.logger import logger


class PostgresClient:
    """Async PostgreSQL client"""
    
    def __init__(self):
        self.pool = None
    
    async def connect(self):
        """Create connection pool"""
        try:
            self.pool = await asyncpg.create_pool(
                settings.postgres_url,
                min_size=2,
                max_size=10,
                command_timeout=60
            )
            logger.info("PostgreSQL connection pool created")
        except Exception as e:
            logger.error(f"Failed to connect to PostgreSQL: {e}")
            raise
    
    async def disconnect(self):
        """Close connection pool"""
        if self.pool:
            await self.pool.close()
            logger.info("PostgreSQL connection pool closed")
    
    async def fetch(self, query: str, *args):
        """Fetch multiple rows"""
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *args)
    
    async def fetchrow(self, query: str, *args):
        """Fetch single row"""
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(query, *args)
    
    async def fetchval(self, query: str, *args):
        """Fetch single value"""
        async with self.pool.acquire() as conn:
            return await conn.fetchval(query, *args)
    
    async def execute(self, query: str, *args):
        """Execute query"""
        async with self.pool.acquire() as conn:
            return await conn.execute(query, *args)
    
    async def transaction(self):
        """Get transaction context"""
        conn = await self.pool.acquire()
        return conn.transaction()


# Global instance
pg_client = PostgresClient()
