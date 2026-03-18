"""Main entry point for Altese AI Worker"""
import asyncio
import signal
from dotenv import load_dotenv

from config.settings import settings
from utils.logger import logger
from utils.postgres_client import pg_client
from services.vector_db_service import VectorDBService
from services.openai_service import OpenAIService
from services.memory_manager import MemoryManager
from services.routing_service import RoutingService
from services.agent_config_service import AgentConfigService
from services.multi_agent_config_service import MultiAgentConfigService
from services.redis_pubsub_service import redis_pubsub_service
from services.function_call_processor import FunctionCallProcessor
from agent.langchain_agent import AlteseAgent
from agent.router_agent import RouterAgent
from agent.langgraph_flow import AlteseAttendanceFlow
from consumers.message_consumer import MessageConsumer


class AIWorker:
    """Main AI Worker application"""
    
    def __init__(self):
        self.consumer = None
        self.running = False
        self.agent_config_service = None
        self.multi_agent_config_service = None
        self.function_call_processor = None
    
    async def initialize(self):
        """Initialize all services"""
        import os
        worker_pid = os.getpid()
        logger.info(f"🚀 Initializing Altese AI Worker... [Worker PID: {worker_pid}]")
        logger.info(f"📂 Working directory: {os.getcwd()}")
        
        # Connect to PostgreSQL
        await pg_client.connect()
        
        # Connect to Redis for Pub/Sub
        try:
            await redis_pubsub_service.connect()
            logger.info("✅ Redis Pub/Sub connected - cache invalidation will be real-time")
        except Exception as e:
            logger.warning(f"Redis Pub/Sub unavailable: {e} - will use cache TTL fallback")
        
        # Initialize agent configuration service (loads prompts from database)
        # Deve ser inicializado ANTES do OpenAIService para poder passar como parâmetro
        self.agent_config_service = AgentConfigService(pg_client, redis_pubsub_service)
        logger.info("Agent config service initialized - will load prompts from database")
        
        # Initialize multi-agent config service
        self.multi_agent_config_service = MultiAgentConfigService(pg_client, redis_pubsub_service)
        try:
            await self.multi_agent_config_service.setup_redis_invalidation()
            logger.info("Multi-agent config service initialized")
        except Exception as e:
            logger.warning(f"Could not setup multi-agent Redis invalidation: {e}")
        
        # Initialize services
        vector_db = VectorDBService()
        openai_service = OpenAIService(agent_config_service=self.agent_config_service)
        memory_manager = MemoryManager(vector_db, pg_client, openai_service)
        routing_service = RoutingService(pg_client, settings.node_api_url, settings.internal_api_key)
        
        # Initialize Function Call Processor
        try:
            self.function_call_processor = FunctionCallProcessor()
            await self.function_call_processor.initialize()
            logger.info("✅ FunctionCallProcessor initialized")
        except Exception as e:
            logger.warning(f"FunctionCallProcessor unavailable: {e} - function calls will not be processed via RabbitMQ")
            self.function_call_processor = None
        
        # Initialize LangChain Agent and LangGraph Flow
        agent = AlteseAgent(memory_manager, routing_service, self.agent_config_service, self.function_call_processor, self.multi_agent_config_service)
        await agent.initialize_tools()

        # Initialize Router Agent (if multi-agent is enabled)
        router_agent = None
        try:
            is_multi_agent_enabled = await self.multi_agent_config_service.is_multi_agent_enabled()
            if is_multi_agent_enabled:
                router_agent = RouterAgent(self.multi_agent_config_service)
                await router_agent.initialize()
                logger.info("✅ Router Agent initialized (multi-agent mode enabled)")
            else:
                logger.info("Multi-agent mode disabled - Router Agent not initialized")
        except Exception as e:
            logger.warning(f"Could not initialize Router Agent: {e}")

        # Setup Redis Pub/Sub (after agent created, so temperature invalidation can reset tools)
        try:
            await self.agent_config_service.setup_redis_invalidation(agent=agent)
        except Exception as e:
            logger.warning(f"Could not setup Redis invalidation: {e}")

        # Bootstrap AI enabled flag (worker pauses consumption when disabled)
        await self.agent_config_service.get_ai_enabled()
        logger.info(f"✅ AI module enabled: {self.agent_config_service.is_ai_enabled()} (toggle via Super Admin)")
        
        flow = AlteseAttendanceFlow(
            agent, 
            memory_manager, 
            routing_service, 
            openai_service,
            multi_agent_config_service=self.multi_agent_config_service,
            router_agent=router_agent,
            agent_config_service=self.agent_config_service,
            function_call_processor=self.function_call_processor
        )
        self.consumer = MessageConsumer(agent, flow, memory_manager, self.agent_config_service)
        
        logger.info("All services initialized successfully")
    
    async def start(self):
        """Start the worker"""
        try:
            await self.initialize()
            self.running = True
            
            # Start consuming messages - this will block and keep the worker alive
            await self.consumer.start()
                
        except Exception as e:
            logger.error(f"Error starting worker: {e}", exc_info=True)
            raise
    
    async def shutdown(self):
        """Graceful shutdown"""
        logger.info("Shutting down AI Worker...")
        self.running = False
        
        # Close consumer
        if self.consumer:
            await self.consumer.stop()
        
        # Close Function Call Processor
        if self.function_call_processor:
            await self.function_call_processor.disconnect()
        
        # Close Redis Pub/Sub
        try:
            await redis_pubsub_service.disconnect()
        except Exception as e:
            logger.error(f"Error disconnecting Redis: {e}")
        
        # Close PostgreSQL
        await pg_client.disconnect()
        
        logger.info("AI Worker shutdown complete")


def main():
    """Main function"""
    # Load environment variables
    # Procurar .env no próprio diretório do ai-worker
    import os
    current_dir = os.path.dirname(os.path.abspath(__file__))  # pasta ai-worker/
    env_path = os.path.join(current_dir, '.env')
    
    # Tentar carregar primeiro do ai-worker/.env, depois deixar o dotenv usar o padrão
    if os.path.exists(env_path):
        load_dotenv(env_path)
        logger.info(f"✅ Carregado .env do ai-worker: {env_path}")
    else:
        load_dotenv()  # Fallback: variáveis já presentes no ambiente
        logger.info("✅ Carregado .env usando resolução padrão (variáveis de ambiente do sistema)")
    
    # Create worker
    worker = AIWorker()
    
    # Setup signal handlers
    def signal_handler(sig, frame):
        logger.info(f"Received signal {sig}, initiating shutdown...")
        asyncio.create_task(worker.shutdown())
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Run worker
    try:
        asyncio.run(worker.start())
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        raise


if __name__ == '__main__':
    main()
