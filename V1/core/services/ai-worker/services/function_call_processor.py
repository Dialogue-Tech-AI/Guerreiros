"""Function Call Processor - Processa function calls via RabbitMQ ou SQS (USE_SQS=true)."""
import json
import asyncio
from typing import Optional, Dict, Any
from aio_pika import connect_robust, Message as AioPikaMessage, IncomingMessage
from aio_pika.abc import AbstractConnection, AbstractChannel, AbstractExchange, AbstractQueue
from utils.logger import logger
from config.settings import settings


class FunctionCallProcessor:
    """
    Processa function calls via RabbitMQ (exchange + routing) ou SQS (duas filas).
    Sempre coloca function_call_name no body para compatibilidade com backend Node (IQueue).
    """
    
    EXCHANGE_NAME = "function_calls"
    QUEUE_PROCESS = "function_call_process"
    QUEUE_RESPONSE = "function_call_response"
    
    def __init__(self):
        self.connection: Optional[AbstractConnection] = None
        self.channel: Optional[AbstractChannel] = None
        self.exchange: Optional[AbstractExchange] = None
        self.process_queue: Optional[AbstractQueue] = None
        self.response_queue: Optional[AbstractQueue] = None
        self.pending_responses: Dict[str, asyncio.Future] = {}
        self._response_consumer_task: Optional[asyncio.Task] = None
        self._initialized = False
        self._sqs_response_stop = asyncio.Event()
    
    async def initialize(self):
        """Inicializa RabbitMQ ou SQS conforme USE_SQS."""
        try:
            logger.info("Initializing FunctionCallProcessor...")
            if settings.use_sqs and settings.sqs_queue_function_call_process_url and settings.sqs_queue_function_call_response_url:
                self._initialized = True
                self._response_consumer_task = asyncio.create_task(self._run_sqs_response_consumer())
                logger.info("✅ FunctionCallProcessor initialized (SQS)")
                return
            # RabbitMQ
            self.connection = await connect_robust(
                settings.rabbitmq_url,
                heartbeat=60
            )
            self.channel = await self.connection.channel()
            await self.channel.set_qos(prefetch_count=10)
            self.exchange = await self.channel.declare_exchange(
                self.EXCHANGE_NAME,
                type="topic",
                durable=True
            )
            logger.info(f"Exchange '{self.EXCHANGE_NAME}' declared (topic)")
            self.process_queue = await self.channel.declare_queue(
                self.QUEUE_PROCESS,
                durable=True
            )
            await self.process_queue.bind(
                self.exchange,
                routing_key="function_call.*"
            )
            self.response_queue = await self.channel.declare_queue(
                self.QUEUE_RESPONSE,
                durable=True
            )
            await self.response_queue.consume(self._handle_response)
            self._initialized = True
            logger.info("✅ FunctionCallProcessor initialized (RabbitMQ)")
        except Exception as e:
            logger.error(f"Error initializing FunctionCallProcessor: {e}", exc_info=True)
            raise

    async def _run_sqs_response_consumer(self):
        """Poll SQS function_call_response and resolve pending futures by correlation_id."""
        from services.sqs_client import receive_messages, delete_message
        url = settings.sqs_queue_function_call_response_url
        while not self._sqs_response_stop.is_set():
            try:
                messages = await asyncio.to_thread(
                    receive_messages,
                    url,
                    max_messages=10,
                    wait_time_seconds=20,
                    visibility_timeout=30,
                )
                for body, receipt_handle in messages:
                    try:
                        correlation_id = body.get("correlation_id")
                        if correlation_id and correlation_id in self.pending_responses:
                            future = self.pending_responses.pop(correlation_id)
                            if not future.done():
                                future.set_result(body)
                            await asyncio.to_thread(delete_message, url, receipt_handle)
                    except Exception as e:
                        logger.warning("Error handling SQS response message: %s", e)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("SQS response consumer error: %s", e)
                await asyncio.sleep(1)
    
    async def process_function_call(
        self,
        function_call_name: str,
        result: Any,
        attendance_id: str,
        client_phone: str,
        has_output: bool,
        is_sync: bool
    ) -> Optional[str]:
        """
        Processa function call via RabbitMQ. Sempre publica na fila (processamento sempre ocorre).
        has_output/is_sync só definem se o agente espera resposta para usar na mensagem ao cliente.
        
        Args:
            function_call_name: Nome da function call
            result: Resultado da execução da function call
            attendance_id: ID do atendimento
            client_phone: Telefone do cliente
            has_output: Se o agente deve usar resposta processada na mensagem ao cliente
            is_sync: Se has_output=True, esperar resposta (síncrono) antes de responder ao cliente
            
        Returns:
            Output string se has_output=True e is_sync=True, None caso contrário
        """
        if not self._initialized:
            logger.warning("FunctionCallProcessor not initialized, skipping processing")
            return None
        
        try:
            if not has_output:
                # Sempre processa na fila; só não espera nem usa resposta no cliente
                await self._publish_process(
                    function_call_name, result, attendance_id, client_phone,
                    correlation_id=None, has_output=has_output, is_sync=is_sync
                )
                return None

            if is_sync:
                # Síncrono: publica e espera resposta
                correlation_id = f"{function_call_name}_{attendance_id}_{asyncio.get_event_loop().time()}"

                # Cria Future para esperar resposta
                future = asyncio.Future()
                self.pending_responses[correlation_id] = future

                # Publica para processamento
                await self._publish_process(
                    function_call_name,
                    result,
                    attendance_id,
                    client_phone,
                    correlation_id=correlation_id,
                    has_output=has_output,
                    is_sync=is_sync,
                )
                
                # Espera resposta (com timeout de 30s)
                try:
                    response = await asyncio.wait_for(future, timeout=30.0)
                    output = response.get('output') if isinstance(response, dict) else None
                    logger.info(f"Received response for {function_call_name}: {output is not None}")
                    return output
                except asyncio.TimeoutError:
                    logger.warning(f"Timeout waiting for response: {correlation_id}")
                    self.pending_responses.pop(correlation_id, None)
                    return None
            else:
                # has_output=True mas assíncrono: processa na fila; worker enviará nova msg ao cliente quando tiver output
                await self._publish_process(
                    function_call_name, result, attendance_id, client_phone,
                    correlation_id=None, has_output=has_output, is_sync=is_sync
                )
                return None
                
        except Exception as e:
            logger.error(f"Error processing function call {function_call_name}: {e}", exc_info=True)
            return None
    
    async def _publish_process(
        self,
        function_call_name: str,
        result: Any,
        attendance_id: str,
        client_phone: str,
        correlation_id: Optional[str] = None,
        has_output: bool = False,
        is_sync: bool = True,
    ):
        """Publica mensagem para processamento (SQS ou RabbitMQ). Body sempre inclui function_call_name."""
        payload = {
            "function_call_name": function_call_name,
            "result": result,
            "attendance_id": attendance_id,
            "client_phone": client_phone,
            "correlation_id": correlation_id,
            "has_output": has_output,
            "is_sync": is_sync,
        }
        if settings.use_sqs and settings.sqs_queue_function_call_process_url:
            from services.sqs_client import send_message
            send_message(settings.sqs_queue_function_call_process_url, payload)
            logger.debug(f"Published to SQS function_call_process: {function_call_name} (correlation_id: {correlation_id})")
            return
        if not self.exchange or not self.channel:
            raise RuntimeError("FunctionCallProcessor not initialized")
        routing_key = f"function_call.{function_call_name}"
        message = AioPikaMessage(
            json.dumps(payload).encode(),
            correlation_id=correlation_id,
            reply_to=self.QUEUE_RESPONSE if correlation_id else None
        )
        await self.exchange.publish(message, routing_key=routing_key)
        logger.debug(f"Published to {routing_key}: {function_call_name} (correlation_id: {correlation_id})")
    
    async def _handle_response(self, message: IncomingMessage):
        """Processa resposta síncrona (RabbitMQ)."""
        async with message.process():
            try:
                payload = json.loads(message.body.decode())
                correlation_id = message.correlation_id
                if correlation_id and correlation_id in self.pending_responses:
                    future = self.pending_responses.pop(correlation_id)
                    if not future.done():
                        future.set_result(payload)
                    logger.debug(f"Response resolved for correlation_id: {correlation_id}")
                else:
                    logger.warning(f"Received response with unknown correlation_id: {correlation_id}")
            except Exception as e:
                logger.error(f"Error handling response: {e}", exc_info=True)
    
    async def disconnect(self):
        """Desconecta (SQS ou RabbitMQ)."""
        try:
            self._sqs_response_stop.set()
            if self._response_consumer_task:
                self._response_consumer_task.cancel()
                try:
                    await self._response_consumer_task
                except asyncio.CancelledError:
                    pass
            if self.channel:
                await self.channel.close()
            if self.connection:
                await self.connection.close()
            logger.info("FunctionCallProcessor disconnected")
        except Exception as e:
            logger.error(f"Error disconnecting FunctionCallProcessor: {e}", exc_info=True)
