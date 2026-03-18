"""LangGraph State Machine for Attendance Flow"""
from typing import TypedDict, Annotated, Sequence, Any, Dict, Optional
from langgraph.graph import StateGraph, END
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
import operator
import asyncio
import httpx
from config.settings import settings
from services.cost_reporter import compute_usd_brl
from utils.logger import logger
from datetime import datetime, time
import pytz
from workflow import WorkflowRunner, WorkflowRuntimeInput


async def _record_routing_decision(
    attendance_id: str,
    router_id: str,
    decision: Dict[str, Any],
    message_id: Optional[str] = None,
) -> None:
    """Fire-and-forget: POST routing decision to Node internal API for audit."""
    try:
        base = (settings.node_api_url or "").rstrip("/")
        if not base or not settings.internal_api_key:
            return
        url = f"{base}/api/internal/routing-decisions"
        payload = {
            "attendanceId": attendance_id,
            "messageId": message_id,
            "routerId": router_id,
            "outputId": decision.get("output_id"),
            "destinationType": decision.get("destination_type") or "fixed",
            "destinationId": decision.get("destination_id"),
            "responseId": decision.get("response_id"),
            "confidence": decision.get("confidence"),
        }
        async with httpx.AsyncClient() as client:
            await client.post(
                url,
                json=payload,
                headers={"X-Internal-Auth": settings.internal_api_key},
                timeout=5.0,
            )
    except Exception as e:
        logger.debug(f"Failed to record routing decision: {e}")


class AttendanceState(TypedDict):
    """State for attendance flow"""
    messages: Annotated[Sequence[BaseMessage], operator.add]
    attendance_id: str
    client_phone: str
    whatsapp_number_id: str
    current_step: str
    collected_data: dict
    should_route: bool
    routing_completed: bool
    pending_created: bool
    error: str | None
    cost_accumulator: dict
    last_attendance_summary: str  # Resumo do último atendimento (quando atendimento atual é novo); "" se não houver
    intervention_type: str | None  # Canal ativo para o router (ex.: encaminhados-balcao) — identificador injetado no prompt
    operational_state: str | None  # Estado operacional (TRIAGEM, ABERTO, AGUARDANDO_CLIENTE, etc.)
    attendance_context: str | None  # novo | reaberto | em_andamento


class AlteseAttendanceFlow:
    """
    LangGraph state machine for Altese attendance flow
    Manages the complete conversation flow from initial message to routing/closing
    """
    
    def __init__(self, agent, memory_manager, routing_service, openai_service, 
                 multi_agent_config_service=None, router_agent=None, agent_config_service=None, function_call_processor=None):
        self.agent = agent
        self.memory_manager = memory_manager
        self.routing_service = routing_service  # kept for compat; roteamento só via identificamarca
        self.openai_service = openai_service
        self.multi_agent_config_service = multi_agent_config_service
        self.router_agent = router_agent
        self.agent_config_service = agent_config_service
        self.function_call_processor = function_call_processor
        self.graph = self.build_graph()
        self.workflow_runner = None
        if (
            self.multi_agent_config_service
            and self.router_agent
            and self.memory_manager
        ):
            try:
                self.workflow_runner = WorkflowRunner(
                    multi_agent_config_service=self.multi_agent_config_service,
                    router_agent=self.router_agent,
                    memory_manager=self.memory_manager,
                    routing_service=self.routing_service,
                    agent_config_service=self.agent_config_service,
                    function_call_processor=self.function_call_processor,
                    record_routing_decision=_record_routing_decision,
                )
            except Exception as e:
                logger.warning(f"Failed to initialize WorkflowRunner: {e}")
    
    def build_graph(self) -> StateGraph:
        """Build the state graph"""
        workflow = StateGraph(AttendanceState)
        
        # Add nodes
        workflow.add_node("process_media", self.process_media_node)
        workflow.add_node("agent_response", self.agent_response_node)
        workflow.add_node("finalize", self.finalize_node)
        
        # Set entry point
        workflow.set_entry_point("process_media")
        
        # Edges: process_media -> agent_response -> finalize. Roteamento só via FC identificamarca (Node).
        workflow.add_edge("process_media", "agent_response")
        workflow.add_edge("agent_response", "finalize")
        workflow.add_edge("finalize", END)
        
        return workflow.compile()
    
    async def process_media_node(self, state: AttendanceState) -> AttendanceState:
        """
        Process media (audio/image) if present
        
        IMPORTANTE: Áudio e imagem JÁ são processados pelo Node.js backend
        (Whisper/Vision) ANTES de chegar aqui. Este nó apenas valida se o
        processamento foi feito. Se não foi (fallback), tenta processar aqui.
        """
        try:
            last_message = state["messages"][-1]
            
            if hasattr(last_message, 'additional_kwargs'):
                media_type = last_message.additional_kwargs.get('mediaType', 'text')
                media_url = last_message.additional_kwargs.get('mediaUrl')
                current_content = last_message.content or ""
                
                # Log para debug - verificar o que está chegando
                logger.debug(f"Media processing - type: {media_type}, url: {media_url[:80] if media_url else 'None'}..., content: {current_content[:80]}...")
                
                # Placeholders que indicam que áudio/imagem ainda NÃO foi transcrito/descrito
                _placeholder_indicators = (
                    '[Processando',
                    '[Áudio sem transcrição]',
                    '[Imagem sem descrição]',
                    '[Áudio]',
                    '[Imagem]',
                    '[Mensagem de mídia]',
                )
                _content_has_placeholder = any(p in (current_content or '') for p in _placeholder_indicators)

                # Check if already processed by Node.js (content is not a placeholder)
                is_already_processed = (
                    current_content and
                    not _content_has_placeholder and
                    len(current_content.strip()) > 5  # Has substantial content
                )

                # Se temos mediaUrl e o conteúdo ainda é placeholder, forçar processamento (transcrição/descrição) aqui
                if media_url and (media_type == 'audio' or media_type == 'image') and _content_has_placeholder:
                    is_already_processed = False

                if is_already_processed:
                    logger.info(f"✅ Media already processed by Node.js - using existing content")
                    logger.info(f"   Media type: {media_type}")
                    logger.info(f"   Content length: {len(current_content)}")
                    logger.info(f"   Content preview: {current_content[:200]}...")
                    
                    # Wrap in semantic tags if not already wrapped
                    if media_type == 'audio' and not current_content.startswith('<audio>') and not current_content.startswith('<Audio>'):
                        last_message.content = f"<audio>\n{current_content}\n</audio>"
                        logger.info("   ✅ Wrapped audio content in semantic tags")
                        logger.info(f"   Final content: {last_message.content[:200]}...")
                    elif media_type == 'image' and not current_content.startswith('<imagem>') and not current_content.startswith('<Image>'):
                        last_message.content = f"<imagem>\n{current_content}\n</imagem>"
                        logger.info("   ✅ Wrapped image content in semantic tags")
                        logger.info(f"   Final content: {last_message.content[:200]}...")
                    else:
                        logger.info(f"   Content already has semantic tags, keeping as-is")
                    
                    # Skip processing - already done by Node.js
                    state["current_step"] = "media_processed"
                    logger.info(f"✅ Returning state with processed media content")
                    return state
                
                # If not processed yet (fallback), process here
                if media_type == 'audio' and media_url:
                    logger.info(f"🎤 Processing audio message: {media_url[:80]}...")
                    # Obter messageId dos additional_kwargs se disponível
                    message_id = last_message.additional_kwargs.get('messageId')
                    transcription = await self.openai_service.transcribe_audio(media_url, message_id)
                    
                    # Validar que a transcrição não está vazia e não é um erro
                    if not transcription or transcription.strip() == "":
                        logger.warning("⚠️  Audio transcription is empty - using fallback message")
                        transcription = "[Áudio recebido mas não foi possível transcrever]"
                    elif transcription.startswith("[Erro"):
                        logger.warning(f"⚠️  Audio transcription failed: {transcription}")
                        # Manter a mensagem de erro mas envolver em tags
                    
                    # Envolver transcrição em tags <Audio> para a LLM entender que é um áudio
                    last_message.content = f"<Audio>{transcription}</Audio>"
                    logger.info(f"✅ Audio transcribed and ready for LLM processing: {transcription[:100]}...")
                elif media_type == 'audio' and not media_url:
                    # Se mediaType é 'audio' mas não há mediaUrl, tratar como texto
                    logger.warning(f"⚠️  mediaType is 'audio' but no mediaUrl provided - treating as text")
                    original_content = last_message.content or ""
                    if original_content and not original_content.strip().startswith("<Text>"):
                        last_message.content = f"<Text>{original_content}</Text>"
                        logger.debug(f"Text message (incorrectly marked as audio) wrapped in <Text> tags")
                
                elif media_type == 'image' and media_url:
                    logger.info(f"🖼️  Processing image message: {media_url[:80]}...")
                    # Obter messageId dos additional_kwargs se disponível
                    message_id = last_message.additional_kwargs.get('messageId')
                    description = await self.openai_service.describe_image(media_url, message_id)
                    
                    # Validar que a descrição não está vazia e não é um erro
                    if not description or description.strip() == "":
                        logger.warning("⚠️  Image description is empty - using fallback message")
                        description = "[Imagem recebida mas não foi possível analisar]"
                    elif description.startswith("[Erro"):
                        logger.warning(f"⚠️  Image description failed: {description}")
                        # Manter a mensagem de erro mas envolver em tags
                    
                    # Envolver descrição em tags <Image> para a LLM entender que é uma imagem
                    last_message.content = f"<Image>{description}</Image>"
                    logger.info(f"✅ Image described (with OCR) and ready for LLM processing: {description[:100]}...")
                elif media_type == 'image' and not media_url:
                    # Se mediaType é 'image' mas não há mediaUrl, tratar como texto
                    logger.warning(f"⚠️  mediaType is 'image' but no mediaUrl provided - treating as text")
                    original_content = last_message.content or ""
                    if original_content and not original_content.strip().startswith("<Text>"):
                        last_message.content = f"<Text>{original_content}</Text>"
                        logger.debug(f"Text message (incorrectly marked as image) wrapped in <Text> tags")
                
                elif media_type == 'video':
                    # Videos são ignorados conforme requisito
                    last_message.content = "[Cliente enviou um vídeo - não é possível processar vídeos no momento]"
                    logger.info("⚠️  Video message received - not processed")
                elif media_type == 'text' or (not media_type or media_type == ''):
                    # Mensagem de texto normal - envolver em tags <Text>
                    original_content = last_message.content or ""
                    if original_content and not original_content.strip().startswith("<Text>"):
                        last_message.content = f"<Text>{original_content}</Text>"
                        logger.debug(f"Text message wrapped in <Text> tags: {original_content[:50]}...")
                    else:
                        logger.debug("Text message - already wrapped or empty")
                else:
                    # Caso inesperado - tratar como texto
                    logger.warning(f"⚠️  Unexpected media_type '{media_type}' without mediaUrl - treating as text")
                    original_content = last_message.content or ""
                    if original_content and not original_content.strip().startswith("<Text>"):
                        last_message.content = f"<Text>{original_content}</Text>"
                        logger.debug(f"Unexpected media type treated as text: {original_content[:50]}...")
            else:
                # Se não tem additional_kwargs, assumir que é texto e envolver em tags
                original_content = last_message.content or ""
                if original_content and not original_content.strip().startswith("<Text>"):
                    last_message.content = f"<Text>{original_content}</Text>"
                    logger.debug(f"Text message (no kwargs) wrapped in <Text> tags: {original_content[:50]}...")
            
            state["current_step"] = "media_processed"
            return state
            
        except Exception as e:
            logger.error(f"❌ Error processing media: {e}", exc_info=True)
            # Em caso de erro, mantém o conteúdo original ou uma mensagem genérica
            # A LLM processará o que conseguir
            if hasattr(last_message, 'content') and not last_message.content:
                last_message.content = "[Mídia recebida mas não foi possível processar]"
            state["error"] = str(e)
            return state
    
    
    async def agent_response_node(self, state: AttendanceState) -> AttendanceState:
        """Generate response using LangChain agent or multi-agent system"""
        try:
            last_message = state["messages"][-1].content
            
            logger.info(f"Generating agent response for attendance {state['attendance_id']}")
            
            # Cost breakdown (router vs specialist)
            used_multi_agent = False
            router_usage = {}
            router_model = None
            router_ctx = None
            router_decision = None
            specialist_usage = {}
            specialist_model = None
            specialist_name_for_cost = None
            routing_list = []
            specialist_config = None

            # Check if multi-agent mode is enabled
            use_multi_agent = False
            if self.multi_agent_config_service:
                try:
                    use_multi_agent = await self.multi_agent_config_service.is_multi_agent_enabled()
                except Exception as e:
                    logger.warning(f"Error checking multi-agent status: {e}")
                    use_multi_agent = False
            
            router_ctx = None
            router_message_content = last_message
            last_routed_specialist = None
            if use_multi_agent and self.memory_manager:
                current_whatsapp_message_id = None
                try:
                    first_msg = state["messages"][0]
                    if hasattr(first_msg, "additional_kwargs") and first_msg.additional_kwargs:
                        current_whatsapp_message_id = first_msg.additional_kwargs.get("messageId")
                except Exception:
                    current_whatsapp_message_id = None

                router_ctx = await self.memory_manager.build_router_context(
                    attendance_id=state["attendance_id"],
                    current_client_whatsapp_message_id=current_whatsapp_message_id,
                    current_client_content=last_message,
                    previous_messages_count=15,
                )
                router_message_content = router_ctx.get("last_client_message") or last_message
                last_routed_specialist = await self.memory_manager.get_last_routed_specialist(
                    state["attendance_id"]
                )

            workflow_data = None
            if use_multi_agent and self.multi_agent_config_service:
                try:
                    workflow_data = await self.multi_agent_config_service.get_active_workflow()
                    if workflow_data:
                        logger.info(
                            "Workflow ativo encontrado (id=%s, nome=%s)",
                            workflow_data.get("id"),
                            workflow_data.get("name"),
                        )
                except Exception as wf_error:
                    logger.warning(f"Erro ao carregar workflow ativo: {wf_error}")
                    workflow_data = None

            if use_multi_agent and self.router_agent:
                # Multi-agent mode: Router -> Specialist or Greeting
                logger.info("🔀 Multi-agent mode: Using Router Agent")
                used_multi_agent = True
                
                # Router precisa de contexto melhor:
                # - resumo compacto das 15 mensagens anteriores (cliente+IA)
                # - última msg da IA
                # - última msg do cliente (atual)
                chat_history = ""
                if router_ctx:
                    chat_history = router_ctx.get("chat_history") or ""
                else:
                    chat_history = ""

                workflow_executed = False

                # Se workflow estiver ativo, executa WorkflowRunner antes do roteador modular.
                if workflow_data and self.workflow_runner:
                    workflow_runtime = WorkflowRuntimeInput(
                        attendance_id=state["attendance_id"],
                        client_phone=state["client_phone"],
                        message_content=router_message_content,
                        chat_history=chat_history,
                        last_routed_specialist=last_routed_specialist,
                        last_attendance_summary=state.get("last_attendance_summary") or "",
                        operational_state=state.get("operational_state"),
                        attendance_context=state.get("attendance_context"),
                        router_context=router_ctx or {},
                        collected_data=state["collected_data"],
                    )
                    runner_result = await self.workflow_runner.run(workflow_data, workflow_runtime)
                    if runner_result and runner_result.specialist_result:
                        workflow_executed = True
                        result = runner_result.specialist_result
                        specialist_usage = result.get("usage", {}) or {}
                        specialist_config = runner_result.specialist_config
                        specialist_model = None
                        specialist_name_for_cost = runner_result.specialist_name
                        if specialist_config:
                            specialist_model = specialist_config.get("model") or specialist_model
                        router_usage = runner_result.router_usage or {}
                        router_model = runner_result.router_model or router_model
                        router_decision = runner_result.last_decision or {"usage": router_usage}
                        routing_list = runner_result.routing_trace or []
                        # Garante que uso acumulado do router esteja presente no decision para relatórios
                        if router_decision is not None and "usage" not in router_decision:
                            router_decision["usage"] = router_usage
                        logger.info(
                            "Workflow executado com sucesso. Resultado do specialist: %s",
                            specialist_name_for_cost or "desconhecido",
                        )

                if workflow_executed:
                    # Workflow já produziu resultado; pula lógica tradicional de roteadores modulares.
                    pass
                if not workflow_executed:
                    MAX_ROUTER_DEPTH = 10
                    entry_router_id = await self.multi_agent_config_service.get_entry_router_id()
                    specialist_name = None
                    router_decision = None

                    if entry_router_id:
                        router_dict = await self.multi_agent_config_service.get_router_by_id(entry_router_id)
                        if router_dict:
                            visited_router_ids = set()
                            router_depth = 0
                            current_router_id = entry_router_id
                            combined_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
                            last_decision = None

                            while current_router_id and router_depth < MAX_ROUTER_DEPTH:
                                if current_router_id in visited_router_ids:
                                    logger.warning(f"Router loop detected: {current_router_id} already visited, using fallback")
                                    break
                                visited_router_ids.add(current_router_id)
                                router_dict = await self.multi_agent_config_service.get_router_by_id(current_router_id)
                                if not router_dict:
                                    break
                                last_decision = await self.router_agent.route_message_modular(
                                    router_dict,
                                    message_content=router_message_content,
                                    chat_history=chat_history,
                                    last_routed_specialist=last_routed_specialist,
                                )
                                for k in ("prompt_tokens", "completion_tokens", "total_tokens"):
                                    combined_usage[k] = combined_usage.get(k, 0) + (last_decision.get("usage") or {}).get(k, 0)
                                asyncio.create_task(
                                    _record_routing_decision(
                                        state["attendance_id"],
                                        current_router_id,
                                        last_decision,
                                        message_id=None,
                                    )
                                )
                                dest_type = last_decision.get("destination_type") or "fixed"
                                dest_id = last_decision.get("destination_id")
                                if dest_type == "specialist" and dest_id:
                                    specialist_config = await self.multi_agent_config_service.get_specialist_by_id(dest_id)
                                    specialist_name = specialist_config["name"] if specialist_config else None
                                    router_decision = {**last_decision, "usage": combined_usage}
                                    break
                                if dest_type == "router" and dest_id:
                                    if dest_id in visited_router_ids:
                                        logger.warning(f"Router chain would loop to {dest_id}, using fallback")
                                        break
                                    router_depth += 1
                                    current_router_id = dest_id
                                    continue
                                router_decision = {**last_decision, "usage": combined_usage}
                                break

                            if router_decision is None and last_decision:
                                router_decision = {**last_decision, "usage": combined_usage}
                    if router_decision is None:
                        router_decision = {"usage": {}}

                    router_usage = router_decision.get("usage", {}) if router_decision else {}
                    router_model = router_decision.get("model")
                    if router_decision.get("router_stage2"):
                        router_model = router_decision.get("router_stage2", {}).get("model") or router_model
                    elif router_decision.get("router_stage1"):
                        router_model = router_decision.get("router_stage1", {}).get("model") or router_model
                    if router_decision.get("router_stage2_channel"):
                        router_model = router_decision.get("router_stage2_channel", {}).get("model") or router_model
                    elif router_decision.get("router_stage1_intent"):
                        router_model = router_decision.get("router_stage1_intent", {}).get("model") or router_model
                    
                    logger.info(f"🔀 Router: specialist={specialist_name or 'N/A'}")
                    
                    if specialist_name:
                        specialist_config = await self.multi_agent_config_service.get_specialist_by_name(specialist_name)
                        if not specialist_config:
                            logger.warning(f"Specialist '{specialist_name}' not found, falling back to single agent")
                            result = await self.agent.process_message(
                                message_content=last_message,
                                attendance_id=state["attendance_id"],
                                client_phone=state["client_phone"],
                                last_attendance_summary=state.get("last_attendance_summary") or "",
                                operational_state=state.get("operational_state"),
                                attendance_context=state.get("attendance_context"),
                            )
                        else:
                            from agent.specialist_agent import SpecialistAgent
                            specialist_agent = SpecialistAgent(
                                specialist_config=specialist_config,
                                memory_manager=self.memory_manager,
                                routing_service=self.routing_service,
                                agent_config_service=self.agent_config_service,
                                multi_agent_config_service=self.multi_agent_config_service,
                                function_call_processor=self.function_call_processor
                            )
                            await specialist_agent.initialize_tools()
                            result = await specialist_agent.process_message(
                                message_content=last_message,
                                attendance_id=state["attendance_id"],
                                client_phone=state["client_phone"],
                                last_attendance_summary=state.get("last_attendance_summary") or "",
                                operational_state=state.get("operational_state"),
                                attendance_context=state.get("attendance_context"),
                            )
                            
                            steps = result.get("intermediate_steps") or []
                            invoked_roteamento_balcao = any(
                                (getattr(s[0], "tool", None) if hasattr(s[0], "tool") else (s[0].get("tool") if isinstance(s[0], dict) else None)) == "roteamentobalcao"
                                for s in steps if isinstance(s, (list, tuple)) and len(s) >= 1
                            )
                            
                            if not result.get("output") or result.get("output", "").strip() == "":
                                if invoked_roteamento_balcao:
                                    default_msg = "Seu atendimento foi direcionado à equipe do balcão. Nossa equipe em breve dará sequência."
                                    result["output"] = default_msg
                                    specialist_usage = result.get("usage", {}) or {}
                                    specialist_model = specialist_config.get("model") or "gpt-4.1"
                                    specialist_name_for_cost = specialist_name
                                    if specialist_usage:
                                        result["usage"] = {
                                            "prompt_tokens": router_usage.get("prompt_tokens", 0) + specialist_usage.get("prompt_tokens", 0),
                                            "completion_tokens": router_usage.get("completion_tokens", 0) + specialist_usage.get("completion_tokens", 0),
                                            "total_tokens": router_usage.get("total_tokens", 0) + specialist_usage.get("total_tokens", 0),
                                        }
                                    await self.memory_manager.set_last_routed_specialist(state["attendance_id"], specialist_name)
                                    logger.info(f"Specialist '{specialist_name}' invoked roteamentobalcao — using default message, no fallback to single agent")
                                else:
                                    logger.warning(f"Specialist '{specialist_name}' returned empty output, falling back to single agent")
                                    result = await self.agent.process_message(
                                        message_content=last_message,
                                        attendance_id=state["attendance_id"],
                                        client_phone=state["client_phone"],
                                        last_attendance_summary=state.get("last_attendance_summary") or "",
                                        operational_state=state.get("operational_state"),
                                        attendance_context=state.get("attendance_context"),
                                    )
                                    specialist_usage = result.get("usage", {}) or {}
                                    specialist_model = getattr(self.agent, "_model_from_db", None) or settings.openai_model or "gpt-4o-mini"
                                    specialist_name_for_cost = specialist_name
                            else:
                                specialist_usage = result.get("usage", {}) or {}
                                specialist_model = specialist_config.get("model") or "gpt-4.1"
                                specialist_name_for_cost = specialist_name
                                result["usage"] = {
                                    "prompt_tokens": router_usage.get("prompt_tokens", 0) + specialist_usage.get("prompt_tokens", 0),
                                    "completion_tokens": router_usage.get("completion_tokens", 0) + specialist_usage.get("completion_tokens", 0),
                                    "total_tokens": router_usage.get("total_tokens", 0) + specialist_usage.get("total_tokens", 0),
                                }
                                logger.info(f"✅ Specialist '{specialist_name}' processed message")
                                await self.memory_manager.set_last_routed_specialist(state["attendance_id"], specialist_name)
                    else:
                        logger.warning("Router returned no specialist_name, falling back to single agent")
                        result = await self.agent.process_message(
                            message_content=last_message,
                            attendance_id=state["attendance_id"],
                            client_phone=state["client_phone"],
                            last_attendance_summary=state.get("last_attendance_summary") or "",
                            operational_state=state.get("operational_state"),
                            attendance_context=state.get("attendance_context"),
                        )
                        specialist_usage = result.get("usage", {}) or {}
                        specialist_model = getattr(self.agent, "_model_from_db", None) or settings.openai_model or "gpt-4o-mini"
            else:
                # Single agent mode (current behavior)
                result = await self.agent.process_message(
                    message_content=last_message,
                    attendance_id=state["attendance_id"],
                    client_phone=state["client_phone"],
                    last_attendance_summary=state.get("last_attendance_summary") or "",
                    operational_state=state.get("operational_state"),
                    attendance_context=state.get("attendance_context"),
                )
                specialist_usage = result.get("usage", {}) or {}
                specialist_model = getattr(self.agent, "_model_from_db", None) or settings.openai_model or "gpt-4o-mini"
            
            # Check if routing tool was used
            routing_used = False
            if result.get("intermediate_steps"):
                for step in result["intermediate_steps"]:
                    if len(step) >= 1:
                        action = step[0]
                        if hasattr(action, 'tool') and action.tool == "rotear_para_vendedor":
                            routing_used = True
                            # Extract brand from tool input
                            if hasattr(action, 'tool_input'):
                                tool_input = action.tool_input
                                # tool_input can be dict or string
                                if isinstance(tool_input, dict):
                                    brand = tool_input.get("vehicle_brand", "")
                                elif isinstance(tool_input, str):
                                    # If string, it's the brand directly
                                    brand = tool_input
                                else:
                                    brand = ""
                                
                                if brand:
                                    state["collected_data"].update({
                                        "vehicle_brand": brand.upper()
                                    })
                            break
            
            state["should_route"] = routing_used
            
            # Add agent response to messages - apenas se houver output válido
            # Remove mensagens técnicas do LangChain (ex: "Agent stopped due to iteration limit")
            output = result.get("output", "").strip()
            
            # Filtra mensagens técnicas de erro do LangChain
            if output and ("stopped due to iteration limit" in output.lower() or 
                          "stopped due to time limit" in output.lower()):
                logger.warning(f"Agent hit limits for attendance {state['attendance_id']} - filtering technical message")
                output = ""  # Não envia mensagem técnica ao cliente
            
            # Validar que a resposta não contém apenas tags vazias ou literais
            # Se a LLM retornou tags literais como resposta, isso é um erro
            if output:
                import re
                
                # Normalizar output - remover markdown bold (**) e espaços extras
                output_normalized = output.strip()
                output_normalized = re.sub(r'\*\*', '', output_normalized)  # Remove **
                output_normalized = re.sub(r'\*', '', output_normalized)  # Remove *
                output_normalized = output_normalized.strip()
                
                # Verificar se a resposta contém apenas tags vazias (com ou sem espaços, com ou sem markdown)
                # Padrões: <Audio></Audio>, <Audio> </Audio>, <audio></audio>, **<audio></audio>**, etc.
                # Também verificar tags com erro de sintaxe: <audio><\audio>
                tag_patterns = [
                    (r"<[Aa]udio>\s*</?[Aa]udio>", "audio"),  # Captura <audio></audio> e <audio><\audio>
                    (r"<[Ii]mage>\s*</?[Ii]mage>", "image"),  # Captura <image></image> e <image><\image>
                    (r"<[Tt]ext>\s*</?[Tt]ext>", "text"),     # Captura <text></text> e <text><\text>
                ]
                
                for pattern, tag_type in tag_patterns:
                    if re.search(pattern, output_normalized):
                        # Verificar se é apenas tags (sem conteúdo significativo)
                        # Remover tags e verificar se sobra conteúdo
                        content_without_tags = re.sub(r"<[^>]+>", "", output_normalized).strip()
                        # Remover também markdown e caracteres especiais que podem estar confundindo
                        content_without_tags = re.sub(r'[\*\#\-\_\[\]\(\)]', '', content_without_tags).strip()
                        
                        if len(content_without_tags) < 3:  # Menos de 3 caracteres = provavelmente vazio
                            logger.warning(f"⚠️  LLM returned literal empty {tag_type} tags as response: {output}")
                            logger.warning(f"   Normalized: {output_normalized}, Content without tags: '{content_without_tags}'")
                            if tag_type == "audio":
                                output = "Recebi seu áudio, mas não consegui processá-lo corretamente. Pode repetir?"
                            elif tag_type == "image":
                                output = "Recebi sua imagem, mas não consegui processá-la corretamente. Pode enviar novamente?"
                            else:
                                output = "Não entendi sua mensagem. Pode repetir?"
                            break
                        else:
                            # Se tem tags mas também tem conteúdo, remover apenas as tags e usar o conteúdo
                            logger.warning(f"⚠️  LLM returned response with {tag_type} tags - removing tags and using content")
                            logger.debug(f"   Original: {output}, After removing tags: {content_without_tags}")
                            output = content_without_tags
                            break
                
                # Verificar se a resposta contém tags com conteúdo muito curto (provavelmente erro)
                if re.search(r"<[Aa]udio>", output_normalized) and re.search(r"</?[Aa]udio>", output_normalized):
                    # Extrair conteúdo entre tags (mesmo com erro de sintaxe)
                    match = re.search(r"<[Aa]udio>(.*?)</?[Aa]udio>", output_normalized, re.DOTALL)
                    if match:
                        inner_content = match.group(1).strip()
                        if not inner_content or len(inner_content) < 5:
                            logger.warning(f"⚠️  LLM returned audio tags with empty/short content: {output}")
                            output = "Recebi seu áudio, mas não consegui processá-lo corretamente. Pode repetir?"
                
                elif re.search(r"<[Ii]mage>", output_normalized) and re.search(r"</?[Ii]mage>", output_normalized):
                    match = re.search(r"<[Ii]mage>(.*?)</?[Ii]mage>", output_normalized, re.DOTALL)
                    if match:
                        inner_content = match.group(1).strip()
                        if not inner_content or len(inner_content) < 5:
                            logger.warning(f"⚠️  LLM returned image tags with empty/short content: {output}")
                            output = "Recebi sua imagem, mas não consegui processá-la corretamente. Pode enviar novamente?"
                
                elif re.search(r"<[Tt]ext>", output_normalized) and re.search(r"</?[Tt]ext>", output_normalized):
                    match = re.search(r"<[Tt]ext>(.*?)</?[Tt]ext>", output_normalized, re.DOTALL)
                    if match:
                        inner_content = match.group(1).strip()
                        if not inner_content:
                            logger.warning(f"⚠️  LLM returned text tags with empty content: {output}")
                            output = "Não entendi sua mensagem. Pode repetir?"
                        else:
                            # Remover tags e usar conteúdo interno
                            output = inner_content
            
            if output:
                ai_message = AIMessage(content=output)
                state["messages"].append(ai_message)
            else:
                logger.warning(f"Agent returned empty/invalid output for attendance {state['attendance_id']} - no message will be added")
            
            # Store fragments and metadata from structured output
            if result.get("fragments"):
                state["collected_data"]["fragments"] = result["fragments"]
                logger.info(f"Stored {len(result['fragments'])} fragments in state")
            
            if result.get("metadata"):
                state["collected_data"]["response_metadata"] = result["metadata"]
            
            state["current_step"] = "agent_responded"

            # Cost accumulator for Super Admin custos tab
            usage = result.get("usage") or {}
            pt = int(usage.get("prompt_tokens") or 0)
            ct = int(usage.get("completion_tokens") or 0)
            tt = int(usage.get("total_tokens") or 0)
            # Fallback: when agent ran but usage not captured (e.g. tool_call response), estimate so cost is reported
            if tt <= 0 and (result.get("output") or result.get("execution_log") or result.get("intermediate_steps")):
                exec_log = result.get("execution_log") or {}
                if isinstance(exec_log, dict):
                    final_prompt = exec_log.get("finalPrompt") or exec_log.get("systemContextText") or ""
                else:
                    final_prompt = ""
                out_len = len((result.get("output") or "").strip())
                pt = max(100, len(final_prompt) // 4) if final_prompt else 500
                ct = max(50, out_len // 4) if out_len else 100
                tt = pt + ct
                logger.warning(
                    "Usage not captured; using estimated tokens for cost report (agent ran successfully)",
                    extra={"attendance_id": state["attendance_id"], "pt": pt, "ct": ct, "tt": tt},
                )
            model = specialist_model or getattr(self.agent, "_model_from_db", None) or settings.openai_model or "gpt-4o-mini"
            scenario = "text"
            message_id = None
            if state.get("messages"):
                first = state["messages"][0]
                if hasattr(first, "additional_kwargs") and first.additional_kwargs:
                    scenario = (first.additional_kwargs.get("mediaType") or "text").lower()
                    if scenario not in ("text", "audio", "image"):
                        scenario = "text"
                    message_id = first.additional_kwargs.get("messageId")

            # Breakdown: Router vs Specialist (quando multi-agent)
            r_pt = int((router_usage or {}).get("prompt_tokens") or 0)
            r_ct = int((router_usage or {}).get("completion_tokens") or 0)
            r_tt = int((router_usage or {}).get("total_tokens") or 0)
            s_pt = int((specialist_usage or {}).get("prompt_tokens") or 0)
            s_ct = int((specialist_usage or {}).get("completion_tokens") or 0)
            s_tt = int((specialist_usage or {}).get("total_tokens") or 0)
            r_model = router_model or "gpt-4.1-mini"
            s_model = specialist_model or model

            r_usd, r_brl = compute_usd_brl(r_pt, r_ct, r_tt, r_model, whisper_minutes=None, usd_brl_rate=settings.usd_brl_rate)
            s_usd, s_brl = compute_usd_brl(s_pt, s_ct, s_tt, s_model, whisper_minutes=None, usd_brl_rate=settings.usd_brl_rate)

            # Total: preferir soma do breakdown para multi-agent, senão manter o total do result
            if used_multi_agent:
                usd = r_usd + s_usd
                brl = r_brl + s_brl
            else:
                usd, brl = compute_usd_brl(pt, ct, tt, model, whisper_minutes=None, usd_brl_rate=settings.usd_brl_rate)

            exec_log_raw = result.get("execution_log") or {}
            # Se execution_log for uma coroutine (não foi aguardada), aguardar agora
            if hasattr(exec_log_raw, '__await__'):
                exec_log_raw = await exec_log_raw
            if not isinstance(exec_log_raw, dict):
                exec_log_raw = {}
            routing_list = routing_list or []
            if used_multi_agent and router_decision is not None:
                rctx = router_ctx or {}
                chat_hist = rctx.get("chat_history") or ""
                msg_recv = rctx.get("last_client_message") or last_message
                routing_list.append({
                    "name": "Router",
                    "messageReceived": (msg_recv[:2000] if isinstance(msg_recv, str) else str(msg_recv)[:2000]),
                    "contextReceived": (chat_hist or "")[:3000],
                    "decision": router_decision.get("specialist_name") or router_decision.get("response_id") or "",
                    "agentChosen": specialist_name_for_cost or "",
                    "tag": state.get("intervention_type"),
                })
            tokens_block = {
                "promptTokens": pt,
                "completionTokens": ct,
                "totalTokens": tt,
                "usdCost": round(usd, 6),
                "brlCost": round(brl, 6),
            }
            if used_multi_agent:
                tokens_block["router"] = {
                    "promptTokens": r_pt,
                    "completionTokens": r_ct,
                    "totalTokens": r_tt,
                    "usdCost": round(r_usd, 6),
                    "brlCost": round(r_brl, 6),
                }
                tokens_block["specialist"] = {
                    "promptTokens": s_pt,
                    "completionTokens": s_ct,
                    "totalTokens": s_tt,
                    "usdCost": round(s_usd, 6),
                    "brlCost": round(s_brl, 6),
                }
            execution_log = {
                "routing": routing_list,
                "specialist": exec_log_raw.get("specialist"),
                "configuredPrompt": exec_log_raw.get("configuredPrompt"),
                "universalPrompt": exec_log_raw.get("universalPrompt"),
                "conversationHistory": exec_log_raw.get("conversationHistory"),
                "systemAdditions": exec_log_raw.get("systemAdditions"),
                "systemContextText": exec_log_raw.get("systemContextText"),
                # systemFinalInstructions removido dos logs - já exibidas no sistema
                "finalPrompt": exec_log_raw.get("finalPrompt"),
                "openaiPayload": exec_log_raw.get("openaiPayload"),
                "toolsAvailable": exec_log_raw.get("toolsAvailable"),
                "toolsUsed": exec_log_raw.get("toolsUsed"),
                "tokens": tokens_block,
            }

            state["cost_accumulator"] = {
                "attendance_id": state["attendance_id"],
                "message_id": message_id,
                "client_phone": state["client_phone"],
                "scenario": scenario,
                "model": model,
                "prompt_tokens": pt,
                "completion_tokens": ct,
                "total_tokens": tt,
                "whisper_minutes": None,
                "usd_cost": usd,
                "brl_cost": brl,
                # Breakdown
                "router_model": r_model if used_multi_agent else None,
                "router_prompt_tokens": r_pt if used_multi_agent else 0,
                "router_completion_tokens": r_ct if used_multi_agent else 0,
                "router_total_tokens": r_tt if used_multi_agent else 0,
                "router_usd_cost": r_usd if used_multi_agent else 0,
                "router_brl_cost": r_brl if used_multi_agent else 0,
                "specialist_name": specialist_name_for_cost,
                "specialist_model": s_model,
                "specialist_prompt_tokens": s_pt,
                "specialist_completion_tokens": s_ct,
                "specialist_total_tokens": s_tt,
                "specialist_usd_cost": s_usd,
                "specialist_brl_cost": s_brl,
                "execution_log": execution_log,
            }
            if tt > 0:
                logger.info(
                    "Cost accumulator: tokens=%s usd=%.6f brl=%.4f",
                    tt, usd, brl,
                    extra={"attendance_id": state["attendance_id"], "model": model},
                )
            else:
                logger.warning(
                    "Cost accumulator: total_tokens=0 (usage not captured) for attendance %s",
                    state["attendance_id"],
                )
            
            logger.info(f"Agent response complete. Should route: {routing_used}")
            return state
            
        except Exception as e:
            logger.error(f"Error in agent response node: {e}", exc_info=True)
            state["error"] = str(e)
            state["cost_accumulator"] = {}
            return state
    
    async def finalize_node(self, state: AttendanceState) -> AttendanceState:
        """Finalize processing"""
        state["current_step"] = "completed"
        logger.info(f"Flow completed for attendance {state['attendance_id']}")
        return state
    
    async def run(self, initial_state: AttendanceState) -> AttendanceState:
        """
        Execute the complete flow
        
        Args:
            initial_state: Initial state
            
        Returns:
            Final state after execution
        """
        try:
            logger.info(f"Starting LangGraph flow for attendance {initial_state['attendance_id']}")
            final_state = await self.graph.ainvoke(initial_state)
            logger.info(f"LangGraph flow completed for attendance {initial_state['attendance_id']}")
            return final_state
        except Exception as e:
            logger.error(f"Error running LangGraph flow: {e}", exc_info=True)
            raise
