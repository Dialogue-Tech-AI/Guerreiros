"""
Multi-Agent Configuration Service
Loads multi-agent configs from PostgreSQL database with Redis cache invalidation
"""
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta
from utils.postgres_client import pg_client
from utils.logger import logger
from utils.brasilia_time import apply_prompt_placeholders
from services.redis_pubsub_service import redis_pubsub_service


class MultiAgentConfigService:
    """
    Service for loading multi-agent configuration from database
    Supports Redis Pub/Sub cache invalidation
    """
    
    def __init__(self, pg_client_instance, redis_pubsub_service_instance=None):
        self.pg_client = pg_client_instance
        self.redis_pubsub_service = redis_pubsub_service_instance
        
        # Cache for multi-agent enabled status
        self._is_enabled_cache: Optional[bool] = None
        self._is_enabled_cache_timestamp: Optional[datetime] = None
        self._cache_ttl = timedelta(minutes=5)
        
        # Cache for router config
        self._router_config_cache: Optional[Dict[str, Any]] = None
        self._router_config_cache_timestamp: Optional[datetime] = None
        
        # Cache for specialists
        self._specialists_cache: Optional[List[Dict[str, Any]]] = None
        self._specialists_cache_timestamp: Optional[datetime] = None
        
        # Cache for workflows
        self._workflow_cache: Dict[str, Tuple[Dict[str, Any], datetime]] = {}
        self._active_workflow_cache: Optional[Dict[str, Any]] = None
        self._active_workflow_cache_timestamp: Optional[datetime] = None
    
    def _is_cache_valid(self, cache_timestamp: Optional[datetime]) -> bool:
        """Check if cache is still valid"""
        if cache_timestamp is None:
            return False
        return datetime.now() - cache_timestamp < self._cache_ttl
    
    async def is_multi_agent_enabled(self, force_reload: bool = False) -> bool:
        """
        Check if multi-agent mode is enabled
        
        Args:
            force_reload: Force reload from database, ignoring cache
            
        Returns:
            True if multi-agent mode is enabled, False otherwise
        """
        try:
            if not force_reload and self._is_cache_valid(self._is_enabled_cache_timestamp):
                return self._is_enabled_cache or False
            
            row = await self.pg_client.fetchrow(
                """
                SELECT is_enabled 
                FROM multi_agent_config 
                ORDER BY created_at DESC 
                LIMIT 1
                """
            )
            
            is_enabled = row['is_enabled'] if row else False
            self._is_enabled_cache = is_enabled
            self._is_enabled_cache_timestamp = datetime.now()
            
            return is_enabled
        except Exception as e:
            logger.error(f"Error checking multi-agent status: {e}", exc_info=True)
            return False
    
    async def get_router_config(self, force_reload: bool = False) -> Dict[str, Any]:
        """Legacy: sistema de roteador único removido. Retorna default mínimo (não usado no fluxo)."""
        return {
            'prompt': '',
            'model': 'gpt-4.1',
            'temperature': 0.7,
            'routing_rules': None,
            'routing_responses': [],
            'router_mode': 'single_stage',
            'intent_channel_mapping': {},
            'intent_routing_responses': [],
        }

    async def get_specialist_by_name(self, name: str, force_reload: bool = False) -> Optional[Dict[str, Any]]:
        """
        Get specialist agent by name
        
        Args:
            name: Name of the specialist agent
            force_reload: Force reload from database, ignoring cache
            
        Returns:
            Dict with specialist config or None if not found
        """
        try:
            specialists = await self.get_all_active_specialists(force_reload=force_reload)
            return next((s for s in specialists if s['name'] == name), None)
        except Exception as e:
            logger.error(f"Error getting specialist by name: {e}", exc_info=True, extra={"name": name})
            return None
    
    async def get_universal_prompt(self, force_reload: bool = False) -> str:
        """
        Get universal prompt from multi_agent_config (used in all specialists).
        """
        try:
            row = await self.pg_client.fetchrow(
                """
                SELECT universal_prompt FROM multi_agent_config ORDER BY created_at DESC LIMIT 1
                """
            )
            return (row.get('universal_prompt') or '').strip() if row else ''
        except Exception as e:
            logger.error(f"Error getting universal prompt: {e}", exc_info=True)
            return ''

    async def get_universal_function_calls(self, force_reload: bool = False) -> List[str]:
        """
        Get universal function call names from multi_agent_config (present in all specialists).
        """
        try:
            row = await self.pg_client.fetchrow(
                """
                SELECT universal_function_calls FROM multi_agent_config ORDER BY created_at DESC LIMIT 1
                """
            )
            if not row or row.get('universal_function_calls') is None:
                return []
            val = row['universal_function_calls']
            if isinstance(val, list):
                return [str(x) for x in val if x]
            if isinstance(val, str):
                import json
                try:
                    parsed = json.loads(val)
                    return [str(x) for x in (parsed if isinstance(parsed, list) else []) if x]
                except Exception:
                    return []
            return []
        except Exception as e:
            logger.error(f"Error getting universal function calls: {e}", exc_info=True)
            return []

    def _merge_function_calls(self, universal: List[str], individual: List[str]) -> List[str]:
        """Merge universal + individual, order: universal first, then individual, no duplicates."""
        seen = set()
        out: List[str] = []
        for name in universal + individual:
            if name and name not in seen:
                seen.add(name)
                out.append(name)
        return out

    async def get_all_active_specialists(self, force_reload: bool = False) -> List[Dict[str, Any]]:
        """
        Get all active specialist agents.
        Cada especialista deve retornar:
        - prompt: APENAS o prompt individual (configurado no painel para o especialista)
        - universal_prompt: prompt universal (configurado no painel, separado)
        Each specialist's effective function_call_names = universal_function_calls + individual function_call_names (sem duplicatas).
        """
        try:
            if not force_reload and self._is_cache_valid(self._specialists_cache_timestamp):
                return self._specialists_cache or []
            
            universal = await self.get_universal_prompt(force_reload=force_reload)
            universal_fc = await self.get_universal_function_calls(force_reload=force_reload)
            
            rows = await self.pg_client.fetch(
                """
                SELECT id, name, prompt, model, temperature, function_call_names, is_active
                FROM specialist_agents
                WHERE is_active = true
                ORDER BY name
                """
            )
            
            specialists = []
            for row in rows:
                function_call_names = row.get('function_call_names') or []
                if isinstance(function_call_names, str):
                    import json
                    try:
                        function_call_names = json.loads(function_call_names)
                    except Exception:
                        function_call_names = []
                if not isinstance(function_call_names, list):
                    function_call_names = []
                
                effective_fc = self._merge_function_calls(universal_fc, function_call_names)
                
                individual = (row['prompt'] or '').strip()
                # IMPORTANTE: não mesclar universal no prompt do especialista aqui.
                # O worker monta a mensagem final de forma determinística e logável.
                individual_prompt = apply_prompt_placeholders(individual)
                
                specialists.append({
                    'id': str(row['id']),
                    'name': row['name'],
                    'prompt': individual_prompt,
                    'universal_prompt': universal,
                    'model': row['model'] or 'gpt-4.1',
                    'temperature': float(row['temperature']) if row['temperature'] is not None else 0.7,
                    'function_call_names': effective_fc,
                    'is_active': row.get('is_active', True),
                })
            
            self._specialists_cache = specialists
            self._specialists_cache_timestamp = datetime.now()
            
            return specialists
        except Exception as e:
            logger.error(f"Error getting all active specialists: {e}", exc_info=True)
            return []
    
    async def get_specialist_function_calls(self, specialist_name: str) -> List[str]:
        """
        Get function call names for a specialist
        
        Args:
            specialist_name: Name of the specialist agent
            
        Returns:
            List of function call names
        """
        try:
            specialist = await self.get_specialist_by_name(specialist_name)
            if not specialist:
                return []
            return specialist.get('function_call_names', []) or []
        except Exception as e:
            logger.error(f"Error getting specialist function calls: {e}", exc_info=True, extra={"specialist_name": specialist_name})
            return []
    
    async def get_entry_router_id(self, force_reload: bool = False) -> Optional[str]:
        """
        Get entry router ID from multi_agent_config (modular routers).
        If set, the worker uses this router as the flow entry point instead of router_agent_config.
        """
        try:
            row = await self.pg_client.fetchrow(
                """
                SELECT entry_router_id FROM multi_agent_config ORDER BY created_at DESC LIMIT 1
                """
            )
            if not row or not row.get('entry_router_id'):
                return None
            return str(row['entry_router_id'])
        except Exception as e:
            logger.error(f"Error getting entry_router_id: {e}", exc_info=True)
            return None

    async def get_router_by_id(self, router_id: str, force_reload: bool = False) -> Optional[Dict[str, Any]]:
        """
        Get modular router by ID with its outputs (for use when entry_router_id is set).
        Returns dict with router fields + 'outputs' list (each with id, label, destination_type, destination_id, etc.).
        """
        try:
            row = await self.pg_client.fetchrow(
                """
                SELECT id, name, description, router_type, prompt, model, temperature, config, is_active
                FROM routers WHERE id = $1 AND is_active = true
                """,
                router_id,
            )
            if not row:
                return None
            outputs_rows = await self.pg_client.fetch(
                """
                SELECT id, router_id, label, condition_type, condition_value, destination_type, destination_id,
                       response_text, is_fallback, order_index, is_active
                FROM router_outputs
                WHERE router_id = $1 AND is_active = true
                ORDER BY order_index ASC, created_at ASC
                """,
                router_id,
            )
            outputs = []
            for o in outputs_rows:
                outputs.append({
                    'id': str(o['id']),
                    'router_id': str(o['router_id']),
                    'label': o.get('label') or '',
                    'condition_type': o.get('condition_type'),
                    'condition_value': o.get('condition_value'),
                    'destination_type': o.get('destination_type') or 'fixed',
                    'destination_id': str(o['destination_id']) if o.get('destination_id') else None,
                    'response_text': o.get('response_text'),
                    'is_fallback': bool(o.get('is_fallback', False)),
                    'order_index': int(o.get('order_index') or 0),
                    'is_active': bool(o.get('is_active', True)),
                })
            return {
                'id': str(row['id']),
                'name': row.get('name') or '',
                'description': row.get('description'),
                'router_type': (row.get('router_type') or 'llm_choice').strip(),
                'prompt': (row.get('prompt') or '').strip(),
                'model': (row.get('model') or 'gpt-4.1').strip(),
                'temperature': float(row['temperature']) if row.get('temperature') is not None else 0.7,
                'config': row.get('config') or {},
                'is_active': bool(row.get('is_active', True)),
                'outputs': outputs,
            }
        except Exception as e:
            logger.error(f"Error getting router by id: {e}", exc_info=True, extra={"router_id": router_id})
            return None

    async def get_specialist_by_id(self, specialist_id: str, force_reload: bool = False) -> Optional[Dict[str, Any]]:
        """
        Get specialist agent by ID (for modular router destinations).
        Returns same shape as get_specialist_by_name.
        """
        try:
            universal = await self.get_universal_prompt(force_reload=force_reload)
            universal_fc = await self.get_universal_function_calls(force_reload=force_reload)
            row = await self.pg_client.fetchrow(
                """
                SELECT id, name, prompt, model, temperature, function_call_names, is_active
                FROM specialist_agents WHERE id = $1 AND is_active = true
                """,
                specialist_id,
            )
            if not row:
                return None
            function_call_names = row.get('function_call_names') or []
            if isinstance(function_call_names, str):
                import json
                try:
                    function_call_names = json.loads(function_call_names)
                except Exception:
                    function_call_names = []
            if not isinstance(function_call_names, list):
                function_call_names = []
            effective_fc = self._merge_function_calls(universal_fc, function_call_names)
            individual = (row['prompt'] or '').strip()
            individual_prompt = apply_prompt_placeholders(individual)
            return {
                'id': str(row['id']),
                'name': row['name'],
                'prompt': individual_prompt,
                'universal_prompt': universal,
                'model': row['model'] or 'gpt-4.1',
                'temperature': float(row['temperature']) if row['temperature'] is not None else 0.7,
                'function_call_names': effective_fc,
                'is_active': row.get('is_active', True),
            }
        except Exception as e:
            logger.error(f"Error getting specialist by id: {e}", exc_info=True, extra={"specialist_id": specialist_id})
            return None

    def invalidate_cache(self):
        """Invalidate all caches"""
        self._is_enabled_cache = None
        self._is_enabled_cache_timestamp = None
        self._router_config_cache = None
        self._router_config_cache_timestamp = None
        self._specialists_cache = None
        self._specialists_cache_timestamp = None
        self._workflow_cache = {}
        self._active_workflow_cache = None
        self._active_workflow_cache_timestamp = None
        logger.debug("Multi-agent config cache invalidated")
    
    async def get_workflow_by_id(self, workflow_id: str, force_reload: bool = False) -> Optional[Dict[str, Any]]:
        """
        Load workflow definition (id, name, entry_node_id, definition json) from database.
        """
        try:
            if (
                not force_reload
                and workflow_id in self._workflow_cache
                and self._is_cache_valid(self._workflow_cache[workflow_id][1])
            ):
                return self._workflow_cache[workflow_id][0]
            
            row = await self.pg_client.fetchrow(
                """
                SELECT id, name, description, entry_node_id, definition, is_active, updated_at
                FROM workflows
                WHERE id = $1
                """,
                workflow_id,
            )
            if not row:
                return None
            definition = row.get('definition') or {}
            if isinstance(definition, str):
                import json
                try:
                    definition = json.loads(definition)
                except Exception:
                    definition = {}
            workflow = {
                'id': str(row['id']),
                'name': row.get('name'),
                'description': row.get('description'),
                'entryNodeId': row.get('entry_node_id'),
                'definition': definition,
                'isActive': bool(row.get('is_active', True)),
                'updatedAt': row.get('updated_at'),
            }
            self._workflow_cache[workflow_id] = (workflow, datetime.now())
            return workflow
        except Exception as e:
            logger.error(f"Error loading workflow {workflow_id}: {e}", exc_info=True)
            return None
    
    async def get_active_workflow(self, force_reload: bool = False) -> Optional[Dict[str, Any]]:
        """
        Return currently configured workflow (via multi_agent_config.workflow_id), if any.
        """
        try:
            if (
                not force_reload
                and self._is_cache_valid(self._active_workflow_cache_timestamp)
                and self._active_workflow_cache is not None
            ):
                return self._active_workflow_cache
            
            row = await self.pg_client.fetchrow(
                """
                SELECT workflow_id
                FROM multi_agent_config
                ORDER BY created_at DESC
                LIMIT 1
                """
            )
            if not row or not row.get('workflow_id'):
                self._active_workflow_cache = None
                self._active_workflow_cache_timestamp = datetime.now()
                return None
            
            workflow_id = str(row['workflow_id'])
            workflow = await self.get_workflow_by_id(workflow_id, force_reload=force_reload)
            self._active_workflow_cache = workflow
            self._active_workflow_cache_timestamp = datetime.now()
            return workflow
        except Exception as e:
            logger.error(f"Error getting active workflow: {e}", exc_info=True)
            return None
    
    async def setup_redis_invalidation(self):
        """
        Setup Redis Pub/Sub listener for cache invalidation
        Listens to 'ai:config:update' channel
        """
        if not self.redis_pubsub_service:
            logger.warning("Redis Pub/Sub service not available, cache invalidation disabled")
            return
        
        try:
            async def handle_config_update(message: Dict[str, Any]):
                msg_type = message.get('type', '')
                if msg_type == 'multi_agent_config':
                    logger.info("Multi-agent config updated via Redis, invalidating cache")
                    self.invalidate_cache()
            
            await self.redis_pubsub_service.subscribe('ai:config:update', handle_config_update)
            logger.info("Subscribed to Redis channel: ai:config:update (multi-agent config)")
        except Exception as e:
            logger.warning(f"Failed to setup Redis invalidation for multi-agent config: {e}")
