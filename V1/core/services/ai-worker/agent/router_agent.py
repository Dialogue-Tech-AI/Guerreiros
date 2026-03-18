"""
Router Agent - Escolhe qual resposta pré-configurada usar (por ID).
Não gera texto; retorna response_id. O fluxo sempre usa specialist_name (agente obrigatório).
"""
import httpx
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from utils.brasilia_time import get_brasilia_placeholders
from langchain_community.callbacks.manager import get_openai_callback
from callbacks.token_usage_callback import TokenUsageCallback
from config.settings import settings
from utils.logger import logger
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field

OPENAI_HTTP_TIMEOUT = httpx.Timeout(connect=15.0, read=30.0, write=10.0, pool=10.0)

def _should_fallback_model(exc: Exception) -> bool:
    """
    Detecta erro de modelo inexistente/sem acesso (OpenAI 404 model_not_found).
    Evita depender do tipo exato da exception (pode variar por versão).
    """
    name = exc.__class__.__name__
    msg = str(exc) or ""
    if name == "NotFoundError":
        return True
    if "model_not_found" in msg or "does not exist or you do not have access" in msg:
        return True
    return False

def _is_temperature_unsupported_error(exc: Exception) -> bool:
    """
    Detecta erro de temperatura não suportada (alguns modelos nano só aceitam temperatura padrão = 1.0).
    """
    name = exc.__class__.__name__
    msg = str(exc) or ""
    if name == "BadRequestError":
        if "temperature" in msg.lower() and ("does not support" in msg.lower() or "only the default" in msg.lower()):
            return True
    if "unsupported_value" in msg.lower() and "temperature" in msg.lower():
        return True
    return False

def _fallback_model(model: str | None) -> str | None:
    if not model:
        return model
    # Alias/fallback pragmático: se não tiver acesso ao nano, usar mini.
    model_clean = model.strip()
    # gpt-4o-nano não existe - o correto é gpt-4.1-nano, mas mantemos fallback para compatibilidade
    if model_clean == "gpt-4o-nano":
        return "gpt-4.1-nano"  # Tenta primeiro o modelo correto
    if model_clean == "gpt-4.1-nano":
        return "gpt-4o-mini"  # Se gpt-4.1-nano não estiver disponível, usa mini
    if model_clean == "gpt-5-nano":
        return "gpt-4o-mini"  # Fallback para gpt-4o-mini também
    return model


class RouterDecision(BaseModel):
    """Saída estruturada: apenas o ID da resposta escolhida."""
    response_id: str = Field(
        description="ID da resposta pré-configurada que melhor se aplica à mensagem do cliente."
    )
    confidence: float = Field(
        description="Confiança na escolha (0.0 a 1.0)",
        ge=0.0,
        le=1.0
    )

# Modo "Top-2 → decisão final" foi removido do sistema.


class RouterIntentDecision(BaseModel):
    """Etapa 1 (Intent/Canal mode): escolher saída de intenção por ID."""
    intent_id: str = Field(
        description="ID da saída de intenção configurada que melhor se aplica à mensagem do cliente."
    )
    confidence: float = Field(
        description="Confiança (0.0 a 1.0)",
        ge=0.0,
        le=1.0
    )


class RouterIntentDecisionLegacy(BaseModel):
    """Etapa 1 (Intent/Canal mode legado): classificar intenção do cliente."""
    intent: str = Field(
        description="Intenção: COMPRA, POS_VENDA, INFO_BASICA, ou INDEFINIDO"
    )
    confidence: float = Field(
        description="Confiança (0.0 a 1.0)",
        ge=0.0,
        le=1.0
    )


class RouterChannelDecision(BaseModel):
    """Etapa 2 (Intent/Canal mode): classificar canal de compra (só para POS_VENDA)."""
    channel: str = Field(
        description="Canal: WHATSAPP, LOJA_FISICA, TELEFONE_FIXO, ECOMMERCE, ou DESCONHECIDO"
    )
    confidence: float = Field(
        description="Confiança (0.0 a 1.0)",
        ge=0.0,
        le=1.0
    )


class RouterAgent:
    """
    Router que analisa a mensagem e escolhe uma das respostas possíveis por ID.
    Cada resposta pode ser texto fixo ou encaminhar para um agente especialista.
    """
    
    def __init__(self, multi_agent_config_service):
        self.multi_agent_config_service = multi_agent_config_service
        self.llm = None
        self.structured_llm = None
        self.llm_stage1 = None
        self.structured_llm_stage1 = None
        self.llm_stage2 = None
        self.structured_llm_stage2 = None
        self._initialized = False
        self._current_model = None  # Rastrear modelo atual para detectar mudanças
        self._current_temperature = None
        self._current_stage1_model = None
        self._current_stage1_temperature = None
        self._current_stage2_model = None
        self._current_stage2_temperature = None
    
    async def initialize(self):
        if self._initialized:
            return
        try:
            # Defaults (legacy router config removed; modular routers use route_message_modular)
            model = 'gpt-4.1'
            temp = 0.7
            self.llm = ChatOpenAI(
                model=model,
                temperature=temp,
                streaming=False,
                api_key=settings.openai_api_key,
                timeout=OPENAI_HTTP_TIMEOUT,
                max_retries=0,
            )
            self.structured_llm = self.llm.with_structured_output(
                RouterDecision,
                method="function_calling"
            )
            self._current_model = model
            self._current_temperature = temp
            self._initialized = True
            logger.info(f"✅ Router Agent initialized (model: {model}, temp: {temp})")
        except Exception as e:
            logger.error(f"Error initializing Router Agent: {e}", exc_info=True)
            fallback_model = 'gpt-4.1'
            fallback_temp = 0.7
            self.llm = ChatOpenAI(
                model=fallback_model,
                temperature=fallback_temp,
                streaming=False,
                api_key=settings.openai_api_key,
                timeout=OPENAI_HTTP_TIMEOUT,
                max_retries=0,
            )
            self.structured_llm = self.llm.with_structured_output(
                RouterDecision,
                method="function_calling"
            )
            self._current_model = fallback_model
            self._current_temperature = fallback_temp
            self._initialized = True
            logger.warning(f"Router Agent initialized with fallback config (model: {fallback_model}, temp: {fallback_temp})")

    async def _ensure_llm(self, model: str, temperature: float, schema_model):
        llm = ChatOpenAI(
            model=model,
            temperature=temperature,
            streaming=False,
            api_key=settings.openai_api_key,
            timeout=OPENAI_HTTP_TIMEOUT,
            max_retries=0,
        )
        structured = llm.with_structured_output(schema_model, method="function_calling")
        return llm, structured

    async def _invoke_structured(self, model: str, temperature: float, schema_model, messages, invoke_config):
        llm, structured = await self._ensure_llm(model, temperature, schema_model)
        try:
            return await structured.ainvoke(messages, config=invoke_config), llm, structured, temperature, model
        except Exception as e:
            # Temperatura não suportada (nano)
            if _is_temperature_unsupported_error(e) and temperature != 1.0:
                llm2, structured2 = await self._ensure_llm(model, 1.0, schema_model)
                decision = await structured2.ainvoke(messages, config=invoke_config)
                return decision, llm2, structured2, 1.0, model
            # Modelo inexistente/sem acesso
            if _should_fallback_model(e):
                fb = _fallback_model(model)
                if fb and fb != model:
                    llm2, structured2 = await self._ensure_llm(fb, temperature, schema_model)
                    decision = await structured2.ainvoke(messages, config=invoke_config)
                    return decision, llm2, structured2, temperature, fb
            raise

    def _resolve_specialist_from_intent_channel(
        self, intent: str, channel: Optional[str], mapping: Dict
    ) -> Optional[str]:
        """
        Resolve o nome do especialista a partir de intent e channel usando o mapping configurado.
        
        Args:
            intent: Intenção classificada (COMPRA, POS_VENDA, INFO_BASICA, INDEFINIDO)
            channel: Canal de compra (só para POS_VENDA): WHATSAPP, LOJA_FISICA, TELEFONE_FIXO, ECOMMERCE, DESCONHECIDO
            mapping: Mapeamento intent/canal → specialist_name do DB
            
        Returns:
            Nome do especialista ou None se não encontrado
        """
        if not mapping:
            return None
        
        if intent == "POS_VENDA" and channel:
            pos_venda_map = mapping.get("POS_VENDA", {})
            if isinstance(pos_venda_map, dict):
                return pos_venda_map.get(channel)
            return None
        
        return mapping.get(intent)
    
    async def route_message(
        self,
        message_content: str,
        chat_history: Optional[str] = None,
        last_routed_specialist: Optional[str] = None,
        intervention_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Legacy single router (descontinuado). Retorna specialist_name=None para usar agente único.
        O fluxo usa apenas roteadores modulares (entry_router_id + route_message_modular).
        """
        return {
            "response_id": None,
            "response_text": None,
            "specialist_name": None,
            "confidence": 0,
            "model": None,
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        }

    async def route_message_modular(
        self,
        router_dict: Dict[str, Any],
        message_content: str,
        chat_history: Optional[str] = None,
        last_routed_specialist: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Run a single modular router (from get_router_by_id). Used when entry_router_id is set.
        Returns destination_type, destination_id, output_id, confidence, specialist_name (if specialist), usage, model.
        """
        outputs = router_dict.get('outputs') or []
        active = [o for o in outputs if o.get('is_active', True)]
        if not active:
            fallback = next((o for o in outputs if o.get('is_fallback')), None)
            if fallback:
                return {
                    "destination_type": fallback.get('destination_type') or 'fixed',
                    "destination_id": fallback.get('destination_id'),
                    "output_id": fallback.get('id'),
                    "response_id": fallback.get('id'),
                    "confidence": 0.0,
                    "specialist_name": None,
                    "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
                    "model": router_dict.get('model') or 'gpt-4.1',
                }
            return {
                "destination_type": "fixed",
                "destination_id": None,
                "output_id": None,
                "response_id": None,
                "confidence": 0.0,
                "specialist_name": None,
                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
                "model": router_dict.get('model') or 'gpt-4.1',
            }

        try:
            from utils.brasilia_time import get_brasilia_placeholders
            data_hora_info = ""
            try:
                ph = get_brasilia_placeholders()
                data_hora_info = f"""### DATA E HORA ATUAL (Brasília)
- Data: {ph.get('{{data_brasilia}}', 'N/A')}
- Horário: {ph.get('{{horario_brasilia}}', 'N/A')}
- Dia da semana: {ph.get('{{dia_semana_brasilia}}', 'N/A')}
Use para: saudação adequada (Bom dia / Boa tarde / Boa noite).

"""
            except Exception:
                pass

            ids_labels = "\n".join([
                f"- ID: {o['id']} | Label: {o.get('label', '')}"
                for o in active
            ])
            last_routed_hint = ""
            if last_routed_specialist and last_routed_specialist.strip():
                last_routed_hint = f"""
CONTEXTO: O cliente foi roteado pela última vez para o agente "{last_routed_specialist.strip()}".
Se a mensagem atual NÃO deixar explícito que o cliente quer falar com outra área/assunto, prefira manter no mesmo agente.
"""

            system_prompt = f"""{data_hora_info}{router_dict.get('prompt', '')}
{last_routed_hint}
OPÇÕES DISPONÍVEIS (escolha apenas uma pelo ID):
{ids_labels}

Retorne APENAS o response_id da opção mais adequada à mensagem do cliente."""
            user_message = message_content
            if chat_history:
                user_message = f"{chat_history}\n\nÚltima mensagem do cliente: {message_content}"
            messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_message)]

            model = (router_dict.get('model') or 'gpt-4.1').strip()
            temp = float(router_dict.get('temperature', 0.7)) if router_dict.get('temperature') is not None else 0.7
            llm = ChatOpenAI(
                model=model,
                temperature=temp,
                streaming=False,
                api_key=settings.openai_api_key,
                timeout=OPENAI_HTTP_TIMEOUT,
                max_retries=0,
            )
            structured_llm = llm.with_structured_output(RouterDecision, method="function_calling")
            usage_cb = TokenUsageCallback()
            invoke_config: Dict[str, Any] = {"callbacks": [usage_cb]}
            with get_openai_callback() as openai_cb:
                decision = await structured_llm.ainvoke(messages, config=invoke_config)

            rid = getattr(decision, 'response_id', None) or (decision.get('response_id') if isinstance(decision, dict) else None)
            conf = getattr(decision, 'confidence', 0.5) if hasattr(decision, 'confidence') else (decision.get('confidence', 0.5) if isinstance(decision, dict) else 0.5)
            pt = getattr(usage_cb, 'prompt_tokens', 0) or getattr(openai_cb, 'prompt_tokens', 0)
            ct = getattr(usage_cb, 'completion_tokens', 0) or getattr(openai_cb, 'completion_tokens', 0)
            usage = {"prompt_tokens": pt, "completion_tokens": ct, "total_tokens": pt + ct}

            selected = next((o for o in active if o.get('id') == rid), None)
            if not selected:
                selected = next((o for o in outputs if o.get('is_fallback')), None) or active[0]

            specialist_name = None
            if selected.get('destination_type') == 'specialist' and selected.get('destination_id'):
                # Caller (flow) will resolve specialist_name via get_specialist_by_id if needed
                pass

            return {
                "destination_type": selected.get('destination_type') or 'fixed',
                "destination_id": selected.get('destination_id'),
                "output_id": selected.get('id'),
                "response_id": rid,
                "response_label": selected.get('label'),
                "confidence": float(conf),
                "specialist_name": specialist_name,
                "usage": usage,
                "model": model,
            }
        except Exception as e:
            logger.error(f"Error in route_message_modular: {e}", exc_info=True)
            fallback = next((o for o in outputs if o.get('is_fallback')), None) or (active[0] if active else None)
            return {
                "destination_type": (fallback or {}).get('destination_type') or 'fixed',
                "destination_id": (fallback or {}).get('destination_id'),
                "output_id": (fallback or {}).get('id'),
                "response_id": (fallback or {}).get('id'),
                "response_label": (fallback or {}).get('label'),
                "confidence": 0.5,
                "specialist_name": None,
                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
                "model": router_dict.get('model') or 'gpt-4.1',
            }
