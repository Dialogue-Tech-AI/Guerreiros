"""Agent Configuration Service - Loads dynamic config from database"""
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from utils.postgres_client import PostgresClient
from utils.logger import logger
from utils.brasilia_time import apply_prompt_placeholders


class AgentConfigService:
    """Service to manage agent configuration from database with Redis Pub/Sub invalidation"""
    
    def __init__(self, pg_client: PostgresClient, redis_pubsub_service=None):
        self.pg_client = pg_client
        self.redis_pubsub = redis_pubsub_service
        self._prompt_cache: Optional[str] = None
        self._cache_timestamp: Optional[datetime] = None
        self._cache_ttl = timedelta(seconds=0)  # SEM CACHE - sempre busca do banco para garantir prompt atualizado
        self._pubsub_subscribed = False
        # Cache for function call prompts
        self._function_call_cache: Dict[str, tuple[str, datetime]] = {}
        # Cache for image description prompt
        self._image_description_prompt_cache: Optional[str] = None
        self._image_description_prompt_timestamp: Optional[datetime] = None
        # Optional agent reference for temperature invalidation (set via setup_redis_invalidation)
        self._agent_for_invalidation: Any = None
        # AI module on/off: when False, worker pauses consuming RabbitMQ
        self._ai_enabled: bool = True
    
    async def get_agent_prompt(self, force_reload: bool = False) -> str:
        """
        Get agent prompt from database with caching
        
        Args:
            force_reload: Force reload from database, ignoring cache
            
        Returns:
            Agent prompt string
        """
        try:
            # CACHE DESABILITADO - sempre busca do banco
            # Isso garante que o prompt sempre esteja atualizado, mesmo com múltiplos workers
            # if not force_reload and self._is_cache_valid():
            #     logger.debug("Using cached agent prompt")
            #     return self._prompt_cache
            
            # Fetch from database - SEMPRE busca do banco (cache desabilitado)
            # Isso garante que o prompt sempre esteja atualizado
            logger.info("🔄 Fetching agent prompt from database (cache disabled)")
            row = await self.pg_client.fetchrow(
                """
                SELECT value, metadata, updated_at 
                FROM ai_config 
                WHERE key = $1
                """,
                'agent_prompt'
            )
            
            if row and row['value']:
                prompt_value = row['value']
                prompt_preview = prompt_value[:100] + "..." if len(prompt_value) > 100 else prompt_value
                updated_at = row['updated_at']
                
                # Log detalhado para debug
                logger.info(
                    f"✅ Agent prompt loaded from database (length: {len(prompt_value)} chars, updated_at: {updated_at})",
                    extra={
                        'prompt_length': len(prompt_value),
                        'prompt_preview': prompt_preview,
                        'updated_at': str(updated_at) if updated_at else None
                    }
                )
                
                # Atualiza cache mas não usa (cache desabilitado)
                # Isso permite que invalidate_cache() funcione se necessário
                self._prompt_cache = prompt_value
                self._cache_timestamp = datetime.now()
                # Substitui placeholders de horário de Brasília ({{horario_brasilia}}, {{data_brasilia}}, etc.)
                return apply_prompt_placeholders(prompt_value)
            else:
                # Prompt deve estar configurado no banco - não usa fallback hardcoded
                logger.error(
                    "❌ No agent prompt found in database! Prompt must be configured via Super Admin."
                )
                raise ValueError(
                    "Agent prompt not configured in database. "
                    "Please configure it via Super Admin panel."
                )
                
        except Exception as e:
            logger.error(
                f"Error loading agent prompt from database: {e}",
                exc_info=True
            )
            # Tenta usar cache se disponível
            if self._prompt_cache:
                logger.warning("Using cached prompt due to database error")
                return self._prompt_cache
            else:
                # Sem fallback hardcoded - prompt deve estar no banco
                logger.error(
                    "❌ No agent prompt available (database error and no cache). "
                    "Prompt must be configured via Super Admin panel."
                )
                raise ValueError(
                    "Agent prompt not available. "
                    "Please configure it via Super Admin panel."
                )

    async def get_agent_config(self) -> Dict[str, Any]:
        """
        Compat helper used pela LangChain Agent:
        retorna um dict com o prompt configurado do agente.

        Hoje o único campo relevante é `prompt`, lido da mesma origem
        que o Super Admin grava (`ai_config.key = 'agent_prompt'`).
        """
        prompt = await self.get_agent_prompt(force_reload=False)
        return {"prompt": prompt}
    
    def _is_cache_valid(self) -> bool:
        """Check if cache is still valid"""
        # CACHE DESABILITADO - sempre busca do banco para garantir prompt atualizado
        # Isso evita problemas com múltiplos workers ou cache desatualizado
        return False
    
    def invalidate_cache(self, reason: str = "manual"):
        """
        Invalidate the prompt cache to force reload on next request
        
        Args:
            reason: Reason for invalidation (for logging)
        """
        logger.info(f"🔄 Agent prompt cache invalidated (reason: {reason})")
        self._prompt_cache = None
        self._cache_timestamp = None
    
    async def get_image_description_prompt(self, force_reload: bool = False) -> str:
        """
        Get image description prompt from database
        
        Args:
            force_reload: Force reload from database, ignoring cache
            
        Returns:
            Image description prompt string
        """
        try:
            # SEMPRE busca do banco (cache desabilitado para garantir prompt atualizado)
            logger.info("🔄 Fetching image description prompt from database (cache disabled)")
            row = await self.pg_client.fetchrow(
                """
                SELECT value, metadata, updated_at 
                FROM ai_config 
                WHERE key = $1
                """,
                'image_description_prompt'
            )
            
            if row and row['value']:
                prompt_value = row['value']
                prompt_preview = prompt_value[:100] + "..." if len(prompt_value) > 100 else prompt_value
                updated_at = row['updated_at']
                
                logger.info(
                    f"✅ Image description prompt loaded from database (length: {len(prompt_value)} chars, updated_at: {updated_at})",
                    extra={
                        'prompt_length': len(prompt_value),
                        'prompt_preview': prompt_preview,
                        'updated_at': str(updated_at) if updated_at else None
                    }
                )
                
                # Atualiza cache mas não usa (cache desabilitado)
                self._image_description_prompt_cache = prompt_value
                self._image_description_prompt_timestamp = datetime.now()
                return prompt_value
            else:
                # Sem fallback hardcoded - prompt deve estar configurado no Super Admin
                logger.error(
                    "❌ No image description prompt found in database! "
                    "Prompt must be configured via Super Admin panel."
                )
                raise ValueError(
                    "Image description prompt not configured in database. "
                    "Please configure it via Super Admin panel (Configurações da IA → Prompt → Prompt de Descrição de Imagem)."
                )
                
        except ValueError:
            # Re-raise ValueError (prompt não configurado) sem modificação
            raise
        except Exception as e:
            logger.error(
                f"Error loading image description prompt from database: {e}",
                exc_info=True
            )
            # Tenta usar cache se disponível (já carregado anteriormente)
            if self._image_description_prompt_cache:
                logger.warning("Using cached image description prompt due to database error")
                return self._image_description_prompt_cache
            # Sem cache e sem prompt configurado - lança erro
            raise ValueError(
                "Could not load image description prompt from database. "
                "Please configure it via Super Admin panel (Configurações da IA → Prompt → Prompt de Descrição de Imagem) "
                "and ensure database is accessible."
            ) from e
    
    async def setup_redis_invalidation(self, agent=None):
        """
        Subscribe to Redis Pub/Sub for automatic cache invalidation.
        Should be called after agent is created (pass agent for temperature invalidation).
        """
        if not self.redis_pubsub:
            logger.warning("Redis Pub/Sub not available, cache invalidation will be manual only")
            return
        if agent is not None:
            self._agent_for_invalidation = agent
        if self._pubsub_subscribed:
            logger.debug("Already subscribed to Redis config updates")
            return
        try:
            await self.redis_pubsub.subscribe_to_config_updates(
                self._handle_config_update
            )
            await self.redis_pubsub.subscribe_to_function_call_updates(
                self._handle_function_call_update
            )
            self._pubsub_subscribed = True
            logger.info("✅ Subscribed to Redis config updates for automatic cache invalidation")
        except Exception as e:
            logger.error(f"Failed to subscribe to Redis config updates: {e}", exc_info=True)
    
    async def _handle_function_call_update(self, channel: str, tool_name: str):
        """
        Handle function call prompt update event from Redis Pub/Sub
        
        Args:
            channel: Redis channel name (pattern match)
            tool_name: Tool name that was updated
        """
        logger.info(f"📨 Received function call prompt update: {tool_name} on channel {channel}")
        self.invalidate_function_call_cache(tool_name)
        logger.info(f"✨ Function call prompt cache invalidated for {tool_name} - next request will load new prompt")
    
    async def _handle_config_update(self, channel: str, message: str):
        """
        Handle config update event from Redis Pub/Sub
        
        Args:
            channel: Redis channel name
            message: Message content (config key that was updated)
        """
        logger.info(
            f"📨 Received config update event: '{message}' on channel '{channel}'",
            extra={
                'channel': channel,
                'config_key': message,
                'event_type': 'config_update'
            }
        )
        
        if message == "agent_prompt":
            # Invalidate prompt cache (mesmo com cache desabilitado, força limpeza)
            self.invalidate_cache(reason="redis_pubsub_event")
            
            # Forçar reload imediato para garantir que o próximo get_agent_prompt() busque do banco
        elif message == "image_description_prompt":
            # Invalidate image description prompt cache
            logger.info("🔄 Image description prompt cache invalidated due to Redis event")
            self._image_description_prompt_cache = None
            self._image_description_prompt_timestamp = None
            
            # Forçar reload imediato do prompt de imagem
            try:
                test_prompt = await self.get_image_description_prompt(force_reload=True)
                logger.info(
                    f"✅ Image description prompt reloaded after Redis event (len={len(test_prompt)}, preview: {test_prompt[:80]}...)",
                    extra={
                        "prompt_length": len(test_prompt),
                        "prompt_preview": test_prompt[:100] + "..." if len(test_prompt) > 100 else test_prompt,
                    },
                )
            except Exception as e:
                logger.error(f"❌ Error reloading image description prompt after Redis event: {e}", exc_info=True)
        elif message == "pending_functions":
            logger.info("Received pending_functions update event")
        elif message == "agent_temperature":
            if self._agent_for_invalidation and hasattr(self._agent_for_invalidation, "invalidate_tools"):
                try:
                    self._agent_for_invalidation.invalidate_tools()
                    logger.info("✅ Agent tools invalidated due to temperature update - next request will use new value")
                except Exception as e:
                    logger.error(f"Failed to invalidate agent tools on temperature update: {e}", exc_info=True)
            else:
                logger.debug("agent_temperature update received but no agent registered for invalidation")
        elif message == "openai_model":
            if self._agent_for_invalidation and hasattr(self._agent_for_invalidation, "invalidate_tools"):
                try:
                    self._agent_for_invalidation.invalidate_tools()
                    logger.info("✅ Agent tools invalidated due to OpenAI model update - next request will use new model")
                except Exception as e:
                    logger.error(f"Failed to invalidate agent tools on model update: {e}", exc_info=True)
            else:
                logger.debug("openai_model update received but no agent registered for invalidation")
        elif message == "agent_function_calls":
            # Lista de function calls do agente mudou (add/remove) — recarregar tools na próxima requisição
            if self._agent_for_invalidation and hasattr(self._agent_for_invalidation, "invalidate_tools"):
                try:
                    self._agent_for_invalidation.invalidate_tools()
                    self.invalidate_function_call_cache(None)  # limpa cache de prompts das FCs
                    logger.info("✅ Agent tools invalidated due to agent function calls list update - next request will reload tools")
                except Exception as e:
                    logger.error(f"Failed to invalidate agent tools on function calls list update: {e}", exc_info=True)
            else:
                logger.debug("agent_function_calls update received but no agent registered for invalidation")
        elif message == "ai_enabled":
            try:
                await self.get_ai_enabled()
                logger.info(f"✅ AI enabled flag refreshed from DB: enabled={self._ai_enabled}")
            except Exception as e:
                logger.error(f"Failed to refresh ai_enabled from DB: {e}", exc_info=True)
        elif channel.startswith("config:function_call:"):
            # Function call prompt update
            tool_name = message  # Message contains tool name
            self.invalidate_function_call_cache(tool_name)
            logger.info(f"✨ Function call prompt cache invalidated for {tool_name}")
        else:
            logger.debug(f"Unknown config key update: {message} on channel {channel}")
    
    async def get_pending_functions_config(self) -> dict:
        """Get pending functions configuration from database"""
        try:
            row = await self.pg_client.fetchrow(
                """
                SELECT value, updated_at 
                FROM ai_config 
                WHERE key = $1
                """,
                'pending_functions'
            )
            
            if row and row['value']:
                import json
                return json.loads(row['value'])
            else:
                # Return default config
                return {
                    'orcamento': {'enabled': True},
                    'fechamento': {'enabled': True},
                    'garantias': {'enabled': True},
                    'encomendas': {'enabled': True},
                    'chamado_humano': {'enabled': True}
                }
                
        except Exception as e:
            logger.error(
                f"Error loading pending functions config: {e}",
                exc_info=True
            )
            # Return default config on error
            return {
                'orcamento': {'enabled': True},
                'fechamento': {'enabled': True},
                'garantias': {'enabled': True},
                'encomendas': {'enabled': True},
                'chamado_humano': {'enabled': True}
            }

    def _build_prompt_from_config(self, tool_name: str, row: Dict[str, Any]) -> str:
        """Monta o prompt da function call a partir dos campos da config (function_call_configs)."""
        parts = [f'<Function name="{tool_name}">']
        trigger = (row.get('trigger_conditions') or '').strip()
        if trigger:
            parts.append('  <QuandoUsar>')
            parts.append(f'    {trigger}')
            parts.append('  </QuandoUsar>')
        obj = (row.get('objective') or '').strip()
        if obj:
            parts.append('  <Objetivo>')
            parts.append(f'    {obj}')
            parts.append('  </Objetivo>')
        req = row.get('required_fields') or []
        if isinstance(req, str):
            req = [x.strip() for x in req.split(',') if x.strip()] if req else []
        if req:
            parts.append('  <DadosObrigatorios>')
            for f in req:
                parts.append(f'    <Item>{f}</Item>')
            parts.append('  </DadosObrigatorios>')
        opt = row.get('optional_fields') or []
        if isinstance(opt, str):
            opt = [x.strip() for x in opt.split(',') if x.strip()] if opt else []
        if opt:
            parts.append('  <DadosOpcionais>')
            for f in opt:
                parts.append(f'    <Item>{f}</Item>')
            parts.append('  </DadosOpcionais>')
        timing = (row.get('execution_timing') or '').strip()
        if timing:
            parts.append('  <MomentoDeExecucao>')
            parts.append(f'    {timing}')
            parts.append('  </MomentoDeExecucao>')
        restr = (row.get('restrictions') or '').strip()
        if restr:
            parts.append('  <Restricoes>')
            for line in restr.splitlines():
                line = line.strip()
                if line:
                    parts.append(f'    <Item>{line}</Item>')
            parts.append('  </Restricoes>')
        all_fields = list(req) + list(opt)
        if all_fields:
            fields_str = ', '.join(all_fields)
            parts.append('  <InvocacaoDaFerramenta>')
            parts.append(
                f'    O argumento "data" é OBRIGATÓRIO. Envie sempre um JSON com as chaves: {fields_str}. '
                'Preencha as obrigatórias com dados extraídos da conversa; opcionais se tiver.'
            )
            parts.append(
                '    Acione a FC somente quando tiver coletado todos os campos obrigatórios; '
                'opcionais podem estar vazios ou omitidos. Nunca invoque com "data" vazio.'
            )
            parts.append(
                '    Assim que tiver todos os obrigatórios, invoque esta ferramenta IMEDIATAMENTE. '
                'NÃO pergunte ao cliente "posso lançar o orçamento?" ou "confirmar?" — invocar a ferramenta já registra o pedido.'
            )
            parts.append('  </InvocacaoDaFerramenta>')
        parts.append('</Function>')
        return '\n'.join(parts)

    async def get_function_call_prompt(self, tool_name: str, force_reload: bool = False) -> str:
        """
        Obtém o prompt da function call a partir da tabela NOVA `agent_function_calls`
        (Agente Mode / Biblioteca), não mais das configs legadas.
        """
        try:
            if not force_reload and self._is_function_call_cache_valid(tool_name):
                logger.debug(f"Using cached function call prompt for {tool_name}")
                return self._function_call_cache[tool_name][0]

            logger.info(f"Fetching agent_function_call for prompt: {tool_name}")
            row = await self.pg_client.fetchrow(
                """
                SELECT objective,
                       trigger_conditions,
                       execution_timing,
                       required_fields,
                       optional_fields,
                       restrictions
                FROM agent_function_calls
                WHERE name = $1
                """,
                tool_name,
            )

            if row:
                prompt = self._build_prompt_from_config(tool_name, dict(row))
                self._function_call_cache[tool_name] = (prompt, datetime.now())
                logger.info(
                    "Function call prompt built from agent_function_calls for %s",
                    tool_name,
                    extra={"tool_name": tool_name, "prompt_length": len(prompt)},
                )
                return prompt

            logger.warning(
                "No agent_function_call found for %s; prompt will be minimal. "
                "Crie/ative a function call no painel (Agente Mode).",
                tool_name,
            )
            fallback = (
                f'<Function name="{tool_name}">\n'
                "  Configure Objetivo, Quando acionar e campos obrigatórios/opcionais no painel do Agente.\n"
                "</Function>"
            )
            self._function_call_cache[tool_name] = (fallback, datetime.now())
            return fallback
        except Exception as e:
            logger.error(
                "Error building function call prompt for %s: %s",
                tool_name,
                e,
                exc_info=True,
            )
            if tool_name in self._function_call_cache:
                logger.warning("Using cached prompt for %s due to error", tool_name)
                return self._function_call_cache[tool_name][0]
            return f"[ERRO: Não foi possível montar prompt para {tool_name}]"

    async def get_all_function_call_prompts(self, force_reload: bool = False) -> Dict[str, str]:
        """
        Retorna dict name -> prompt para TODAS as function calls ativas,
        usando exclusivamente a tabela `agent_function_calls`.
        """
        try:
            rows = await self.pg_client.fetch(
                """
                SELECT name,
                       objective,
                       trigger_conditions,
                       execution_timing,
                       required_fields,
                       optional_fields,
                       restrictions
                FROM agent_function_calls
                WHERE is_active = true
                ORDER BY name
                """
            )
            prompts: Dict[str, str] = {}
            for row in rows:
                name = row["name"]
                prompt = self._build_prompt_from_config(name, dict(row))
                prompts[name] = prompt
                self._function_call_cache[name] = (prompt, datetime.now())
            logger.info("Loaded %s function call prompts from agent_function_calls", len(prompts))
            return prompts
        except Exception as e:
            logger.error("Error loading all function call prompts: %s", e, exc_info=True)
            return {}
    
    def _is_function_call_cache_valid(self, tool_name: str) -> bool:
        """Check if function call cache is still valid"""
        if tool_name not in self._function_call_cache:
            return False
        
        prompt, timestamp = self._function_call_cache[tool_name]
        if prompt is None or timestamp is None:
            return False
        
        age = datetime.now() - timestamp
        return age < self._cache_ttl
    
    def invalidate_function_call_cache(self, tool_name: Optional[str] = None):
        """
        Invalidate function call prompt cache
        
        Args:
            tool_name: Specific tool name to invalidate, or None to invalidate all
        """
        if tool_name:
            if tool_name in self._function_call_cache:
                del self._function_call_cache[tool_name]
                logger.info(f"🔄 Function call prompt cache invalidated for {tool_name}")
        else:
            self._function_call_cache.clear()
            logger.info("🔄 All function call prompt caches invalidated")
    
    async def get_active_function_calls(self) -> set[str]:
        """
        Conjunto de nomes de function calls ATIVAS, olhando apenas para `agent_function_calls`.
        """
        try:
            rows = await self.pg_client.fetch(
                """
                SELECT name
                FROM agent_function_calls
                WHERE is_active = true
                """
            )

            active_calls = {row["name"] for row in rows}
            logger.info("Found %s active agent function calls: %s", len(active_calls), active_calls)
            return active_calls

        except Exception as e:
            logger.error("Error loading active agent function calls: %s", e, exc_info=True)
            # On error, return empty set (no function calls active)
            return set()
    
    async def get_active_function_calls_with_metadata(self) -> List[Dict[str, Any]]:
        """
        Function calls ATIVAS com metadados, vindas da tabela nova `agent_function_calls`.
        
        Retorna lista de dicts com:
          - name
          - prompt (XML montado)
          - input_schema (se existir em custom_attributes.input_schema)
          - metadata (custom_attributes bruto)
          - required_fields / optional_fields (listas de strings)
        """
        try:
            rows = await self.pg_client.fetch(
                """
                SELECT name,
                       objective,
                       trigger_conditions,
                       execution_timing,
                       required_fields,
                       optional_fields,
                       restrictions,
                       custom_attributes
                FROM agent_function_calls
                WHERE is_active = true
                ORDER BY name
                """
            )

            function_calls: List[Dict[str, Any]] = []
            for row in rows:
                function_call_name = row["name"]
                metadata = row.get("custom_attributes") or {}

                req = row.get("required_fields") or []
                opt = row.get("optional_fields") or []
                if isinstance(req, str):
                    req = [x.strip() for x in req.split(",") if x.strip()] if req else []
                if isinstance(opt, str):
                    opt = [x.strip() for x in opt.split(",") if x.strip()] if opt else []
                if not isinstance(req, list):
                    req = []
                if not isinstance(opt, list):
                    opt = []

                prompt = self._build_prompt_from_config(function_call_name, dict(row))
                self._function_call_cache[function_call_name] = (prompt, datetime.now())
                input_schema = metadata.get("input_schema") if isinstance(metadata, dict) else None

                function_calls.append(
                    {
                        "name": function_call_name,
                        "prompt": prompt,
                        "input_schema": input_schema,
                        "metadata": metadata,
                        "required_fields": req,
                        "optional_fields": opt,
                    }
                )

            logger.info("Loaded %s active agent function calls with metadata", len(function_calls))
            return function_calls

        except Exception as e:
            logger.error("Error loading active agent function calls with metadata: %s", e, exc_info=True)
            return []
    
    async def is_function_call_active(self, tool_name: str) -> bool:
        """
        Verifica se uma function call está ativa na NOVA tabela `agent_function_calls`.
        """
        try:
            row = await self.pg_client.fetchrow(
                """
                SELECT is_active
                FROM agent_function_calls
                WHERE name = $1
                """,
                tool_name,
            )

            if row is not None:
                is_active = row.get("is_active", False)
                return bool(is_active) if is_active is not None else False

            # Se não existe em agent_function_calls, consideramos inativa
            return False

        except Exception as e:
            logger.error(
                "Error checking if agent function call %s is active: %s",
                tool_name,
                e,
                exc_info=True,
            )
            # Em caso de erro, default para inativa por segurança
            return False
    
    async def get_openai_model(self) -> Optional[str]:
        """
        Get OpenAI model from database configuration
        
        Returns:
            Model name from database, or None if not configured
        """
        try:
            row = await self.pg_client.fetchrow(
                """
                SELECT value 
                FROM ai_config 
                WHERE key = $1
                """,
                'openai_model'
            )
            
            if row and row['value']:
                model = row['value'].strip()
                logger.info(f"OpenAI model loaded from database: {model}")
                return model
            
            return None
            
        except Exception as e:
            logger.warning(
                f"Error loading OpenAI model from database: {e}",
                exc_info=True
            )
            return None

    async def get_agent_temperature(self) -> float:
        """
        Get agent temperature from database configuration (0 = assertivo, 2 = criativo/avoado).
        Default 0.7 if not configured or on error.
        """
        try:
            row = await self.pg_client.fetchrow(
                """
                SELECT value
                FROM ai_config
                WHERE key = $1
                """,
                'agent_temperature'
            )
            if row and row['value']:
                val = float(row['value'].strip())
                if 0 <= val <= 2:
                    logger.info(f"Agent temperature loaded from database: {val}")
                    return val
            return 0.7
        except Exception as e:
            logger.warning(
                f"Error loading agent temperature from database: {e}",
                exc_info=True
            )
            return 0.7

    async def get_ai_enabled(self) -> bool:
        """
        Get AI module enabled state from DB. When False, worker should pause consuming RabbitMQ.
        Updates self._ai_enabled. Default True if not configured or on error.
        """
        try:
            row = await self.pg_client.fetchrow(
                """
                SELECT value
                FROM ai_config
                WHERE key = $1
                """,
                'ai_enabled'
            )
            if row and row['value']:
                v = str(row['value']).strip().lower()
                self._ai_enabled = v in ('true', '1', 'yes')
            else:
                self._ai_enabled = True
            return self._ai_enabled
        except Exception as e:
            logger.warning(
                f"Error loading ai_enabled from database: {e}",
                exc_info=True
            )
            self._ai_enabled = True
            return True

    def is_ai_enabled(self) -> bool:
        """Return cached AI enabled flag (use get_ai_enabled to refresh from DB)."""
        return self._ai_enabled


# Global instance (will be initialized with pg_client in main.py)
_agent_config_service: Optional[AgentConfigService] = None


def initialize_agent_config_service(pg_client: PostgresClient, redis_pubsub_service=None):
    """
    Initialize the global agent config service
    
    Args:
        pg_client: PostgreSQL client
        redis_pubsub_service: Optional Redis Pub/Sub service for cache invalidation
    """
    global _agent_config_service
    _agent_config_service = AgentConfigService(pg_client, redis_pubsub_service)
    logger.info("Agent config service initialized")


def get_agent_config_service() -> AgentConfigService:
    """Get the global agent config service instance"""
    if _agent_config_service is None:
        raise RuntimeError(
            "Agent config service not initialized. "
            "Call initialize_agent_config_service() first."
        )
    return _agent_config_service
