from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, List, Set, Callable, Awaitable, Tuple

from utils.logger import logger
from utils.postgres_client import pg_client
from workflow.function_handlers import (
    FUNCTION_HANDLERS,
    HandlerContext,
    FunctionHandlerOutcome,
)


@dataclass
class WorkflowRuntimeInput:
    attendance_id: str
    client_phone: str
    message_content: str
    chat_history: Optional[str]
    last_routed_specialist: Optional[str]
    last_attendance_summary: str
    operational_state: Optional[str]
    attendance_context: Optional[str]
    router_context: Dict[str, Any]
    collected_data: Dict[str, Any]


@dataclass
class WorkflowRunResult:
    specialist_result: Optional[Dict[str, Any]]
    specialist_config: Optional[Dict[str, Any]]
    specialist_name: Optional[str]
    router_usage: Dict[str, int]
    router_model: Optional[str]
    routing_trace: List[Dict[str, Any]]
    last_decision: Optional[Dict[str, Any]]
    visited_nodes: List[str] = field(default_factory=list)


class WorkflowRunner:
    """
    Executes workflow graphs (function/router/specialist/tool nodes) for multi-agent flows.
    """

    MAX_STEPS = 100
    MAX_DEPTH = 50

    def __init__(
        self,
        *,
        multi_agent_config_service,
        router_agent,
        memory_manager,
        routing_service,
        agent_config_service,
        function_call_processor,
        record_routing_decision: Optional[Callable[[str, str, Dict[str, Any], Optional[str]], Awaitable[None]]] = None,
        function_handlers: Optional[
            Dict[str, Callable[[HandlerContext], Awaitable[FunctionHandlerOutcome]]]
        ] = None,
    ):
        self.multi_agent_config_service = multi_agent_config_service
        self.router_agent = router_agent
        self.memory_manager = memory_manager
        self.routing_service = routing_service
        self.agent_config_service = agent_config_service
        self.function_call_processor = function_call_processor
        self.record_routing_decision = record_routing_decision
        self.function_handlers = function_handlers or FUNCTION_HANDLERS

    async def run(
        self,
        workflow: Dict[str, Any],
        runtime: WorkflowRuntimeInput,
    ) -> Optional[WorkflowRunResult]:
        definition = workflow.get("definition") or {}
        entry_node_id = workflow.get("entryNodeId") or workflow.get("entry_node_id")
        if not entry_node_id:
            logger.warning("WorkflowRunner: workflow sem entryNodeId definido.")
            return None

        nodes = definition.get("nodes") or []
        node_map = {node.get("id"): node for node in nodes if node.get("id")}
        if entry_node_id not in node_map:
            logger.warning("WorkflowRunner: nó de entrada %s não encontrado.", entry_node_id)
            return None

        runtime_data: Dict[str, Any] = {}
        self._bootstrap_runtime_data(runtime, runtime_data)

        visited_nodes: Set[str] = set()
        steps = 0
        current_node_id: Optional[str] = entry_node_id

        router_usage_accum = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        router_model: Optional[str] = None
        routing_trace: List[Dict[str, Any]] = []
        last_decision: Optional[Dict[str, Any]] = None

        specialist_config: Optional[Dict[str, Any]] = None
        specialist_result: Optional[Dict[str, Any]] = None
        specialist_name: Optional[str] = None

        while current_node_id and steps < self.MAX_STEPS:
            if current_node_id in visited_nodes:
                logger.warning("WorkflowRunner: loop detectado no nó %s. Encerrando execução.", current_node_id)
                break
            visited_nodes.add(current_node_id)
            steps += 1

            node = node_map.get(current_node_id)
            if not node:
                logger.warning("WorkflowRunner: nó %s não encontrado na definição.", current_node_id)
                break

            node_type = (node.get("type") or "").lower()

            if node_type == "function":
                outcome = await self._run_function_node(node, runtime, runtime_data)
                current_node_id = self._resolve_next_node(node, outcome.next_handle, outcome.success, None)
                continue

            if node_type == "router":
                decision, usage, model = await self._run_router_node(
                    node,
                    runtime,
                    runtime_data,
                    routing_trace,
                )
                if usage:
                    for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
                        router_usage_accum[key] = router_usage_accum.get(key, 0) + int(usage.get(key) or 0)
                if model:
                    router_model = model
                last_decision = decision
                current_node_id = self._resolve_next_node(node, decision.get("response_id"), None, decision)
                continue

            if node_type == "tool":
                outcome = await self._run_tool_node(node, runtime, runtime_data)
                current_node_id = self._resolve_next_node(node, outcome.next_handle, outcome.success, None)
                continue

            if node_type == "specialist":
                specialist_config, specialist_result, specialist_name = await self._run_specialist_node(
                    node, runtime
                )
                break

            logger.warning("WorkflowRunner: tipo de nó '%s' não suportado.", node_type)
            break

        self._persist_runtime_data(runtime, runtime_data)

        if not specialist_result:
            logger.warning("WorkflowRunner: execução terminou sem alcançar um nó specialist.")
            return None

        return WorkflowRunResult(
            specialist_result=specialist_result,
            specialist_config=specialist_config,
            specialist_name=specialist_name,
            router_usage=router_usage_accum,
            router_model=router_model,
            routing_trace=routing_trace,
            last_decision=last_decision,
            visited_nodes=list(visited_nodes),
        )

    async def _run_function_node(
        self,
        node: Dict[str, Any],
        runtime: WorkflowRuntimeInput,
        runtime_data: Dict[str, Any],
    ) -> FunctionHandlerOutcome:
        config = node.get("config") or {}
        handler_name = config.get("handler")
        params = config.get("params") or {}

        if not handler_name:
            logger.warning("WorkflowRunner: nó function sem handler definido.")
            return FunctionHandlerOutcome(next_handle=params.get("nextHandle"), success=False)

        handler = self.function_handlers.get(handler_name)
        if not handler:
            logger.warning("WorkflowRunner: handler '%s' não registrado.", handler_name)
            return FunctionHandlerOutcome(next_handle=params.get("nextHandle"), success=False)

        context = HandlerContext(
            attendance_id=runtime.attendance_id,
            params=params,
            runtime_data=runtime_data,
            collected_data=runtime.collected_data,
        )

        try:
            outcome = await handler(context)
            return outcome
        except Exception as exc:
            logger.error(f"WorkflowRunner: erro no handler '{handler_name}': {exc}", exc_info=True)
            return FunctionHandlerOutcome(next_handle=params.get("failureHandle"), success=False)

    async def _run_router_node(
        self,
        node: Dict[str, Any],
        runtime: WorkflowRuntimeInput,
        runtime_data: Dict[str, Any],
        routing_trace: List[Dict[str, Any]],
    ) -> Tuple[Dict[str, Any], Dict[str, Any], Optional[str]]:
        config = node.get("config") or {}
        router_id = config.get("routerId")
        if not router_id:
            logger.warning("WorkflowRunner: nó router sem routerId.")
            return {}, {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, None

        router_dict = await self.multi_agent_config_service.get_router_by_id(router_id)
        if not router_dict:
            logger.warning("WorkflowRunner: roteador %s não encontrado ou inativo.", router_id)
            return {}, {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, None

        await self.router_agent.initialize()
        decision = await self.router_agent.route_message_modular(
            router_dict,
            message_content=runtime.message_content,
            chat_history=runtime.chat_history,
            last_routed_specialist=runtime.last_routed_specialist,
        )

        usage = decision.get("usage") or {}
        model = decision.get("model")

        router_ctx = runtime.router_context or {}
        routing_trace.append(
            {
                "name": router_dict.get("name") or f"Router {router_id}",
                "routerId": router_id,
                "decision": decision.get("response_label") or decision.get("response_id"),
                "destinationType": decision.get("destination_type"),
                "destinationId": decision.get("destination_id"),
                "messageReceived": (router_ctx.get("last_client_message") or runtime.message_content)[:2000],
                "contextReceived": (router_ctx.get("chat_history") or runtime.chat_history or "")[:3000],
            }
        )

        if self.record_routing_decision:
            asyncio.create_task(
                self.record_routing_decision(
                    runtime.attendance_id,
                    router_id,
                    decision,
                    message_id=None,
                )
            )

        return decision, usage, model

    async def _run_tool_node(
        self,
        node: Dict[str, Any],
        runtime: WorkflowRuntimeInput,
        runtime_data: Dict[str, Any],
    ) -> FunctionHandlerOutcome:
        config = node.get("config") or {}
        tool_name = config.get("functionCallName")
        if not tool_name:
            logger.warning("WorkflowRunner: nó tool sem functionCallName.")
            return FunctionHandlerOutcome(next_handle=config.get("failureHandle"), success=False)

        payload = config.get("payload") or {}

        if not pg_client.pool:
            logger.warning("WorkflowRunner: PostgreSQL indisponível para executar tool '%s'.", tool_name)
            return FunctionHandlerOutcome(next_handle=config.get("failureHandle") or "failure", success=False)

        try:
            row = await pg_client.fetchrow(
                """
                SELECT has_output, processing_method
                FROM agent_function_calls
                WHERE name = $1 AND is_active = true
                """,
                tool_name,
            )
            if not row:
                logger.warning("WorkflowRunner: function call '%s' não configurada.", tool_name)
                return FunctionHandlerOutcome(next_handle=config.get("failureHandle") or "failure", success=False)

            has_output = bool(row.get("has_output", False))
            is_sync = True  # agent_function_calls has no is_sync; default sync
            processing_method = (row.get("processing_method") or "RABBITMQ").upper()

            processed_output = None
            if processing_method == "RABBITMQ" and self.function_call_processor:
                processed_output = await self.function_call_processor.process_function_call(
                    function_call_name=tool_name,
                    result=payload,
                    attendance_id=runtime.attendance_id,
                    client_phone=runtime.client_phone,
                    has_output=has_output,
                    is_sync=is_sync,
                )
            else:
                logger.warning(
                    "WorkflowRunner: processing_method '%s' não suportado para tool '%s'.",
                    processing_method,
                    tool_name,
                )

            if has_output and is_sync and processed_output and processed_output.get("output"):
                runtime_data.setdefault("tool_outputs", {})[tool_name] = processed_output["output"]

            success = True
            next_handle = config.get("successHandle") or "success"
            return FunctionHandlerOutcome(next_handle=next_handle, success=success)
        except Exception as exc:
            logger.error(f"WorkflowRunner: erro ao executar tool '{tool_name}': {exc}", exc_info=True)
            return FunctionHandlerOutcome(next_handle=config.get("failureHandle") or "failure", success=False)

    async def _run_specialist_node(
        self,
        node: Dict[str, Any],
        runtime: WorkflowRuntimeInput,
    ) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], Optional[str]]:
        from agent.specialist_agent import SpecialistAgent  # Local import para evitar ciclos

        config = node.get("config") or {}
        specialist_id = config.get("specialistId")
        if not specialist_id:
            logger.warning("WorkflowRunner: nó specialist sem specialistId.")
            return None, None, None

        specialist_config = await self.multi_agent_config_service.get_specialist_by_id(specialist_id)
        if not specialist_config:
            logger.warning("WorkflowRunner: especialista %s não encontrado ou inativo.", specialist_id)
            return None, None, None

        specialist_name = specialist_config.get("name")

        specialist_agent = SpecialistAgent(
            specialist_config=specialist_config,
            memory_manager=self.memory_manager,
            routing_service=self.routing_service,
            agent_config_service=self.agent_config_service,
            multi_agent_config_service=self.multi_agent_config_service,
            function_call_processor=self.function_call_processor,
        )
        await specialist_agent.initialize_tools()

        result = await specialist_agent.process_message(
            message_content=runtime.message_content,
            attendance_id=runtime.attendance_id,
            client_phone=runtime.client_phone,
            last_attendance_summary=runtime.last_attendance_summary,
            operational_state=runtime.operational_state,
            attendance_context=runtime.attendance_context,
        )

        if specialist_name:
            await self.memory_manager.set_last_routed_specialist(runtime.attendance_id, specialist_name)

        return specialist_config, result, specialist_name

    def _resolve_next_node(
        self,
        node: Dict[str, Any],
        preferred_handle: Optional[str],
        success: Optional[bool],
        decision: Optional[Dict[str, Any]],
    ) -> Optional[str]:
        outputs = node.get("outputs") or []
        if not outputs:
            return None

        selected = self._select_output(outputs, preferred_handle, success, decision)
        if not selected:
            return None
        return selected.get("targetNodeId")

    def _select_output(
        self,
        outputs: List[Dict[str, Any]],
        preferred_handle: Optional[str],
        success: Optional[bool],
        decision: Optional[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        def norm(value: Any) -> Optional[str]:
            if value is None:
                return None
            return str(value).strip().lower()

        if preferred_handle:
            pref = norm(preferred_handle)
            for output in outputs:
                if norm(output.get("handle")) == pref:
                    return output

        if success is not None:
            success_handle = "success" if success else "failure"
            for output in outputs:
                if norm(output.get("handle")) == success_handle:
                    return output
            for output in outputs:
                cond_type = norm(output.get("conditionType"))
                cond_value = output.get("conditionValue")
                if cond_type in ("boolean", "bool", "match"):
                    if isinstance(cond_value, bool) and cond_value is success:
                        return output
                    cond_norm = norm(cond_value)
                    if cond_norm in ("true", "false"):
                        if (cond_norm == "true" and success) or (cond_norm == "false" and not success):
                            return output

        if decision:
            response_id = norm(decision.get("response_id"))
            response_label = norm(decision.get("response_label"))
            destination_type = norm(decision.get("destination_type"))
            destination_id = norm(decision.get("destination_id"))

            if response_id:
                for output in outputs:
                    if norm(output.get("handle")) == response_id:
                        return output
                for output in outputs:
                    cond_type = norm(output.get("conditionType"))
                    if cond_type in ("response_id", "router_output_id", "decision"):
                        if norm(output.get("conditionValue")) == response_id:
                            return output

            if response_label:
                for output in outputs:
                    if norm(output.get("handle")) == response_label:
                        return output
                for output in outputs:
                    cond_type = norm(output.get("conditionType"))
                    if cond_type in ("label", "response_label"):
                        if norm(output.get("conditionValue")) == response_label:
                            return output

            if destination_type:
                for output in outputs:
                    cond_type = norm(output.get("conditionType"))
                    if cond_type in ("destination_type", "destination"):
                        if norm(output.get("conditionValue")) == destination_type:
                            return output

            if destination_id:
                for output in outputs:
                    cond_type = norm(output.get("conditionType"))
                    if cond_type in ("destination_id", "router_id", "specialist_id"):
                        if norm(output.get("conditionValue")) == destination_id:
                            return output

        fallback = next((out for out in outputs if out.get("isFallback")), None)
        if fallback:
            return fallback
        return outputs[0] if outputs else None

    def _bootstrap_runtime_data(self, runtime: WorkflowRuntimeInput, runtime_data: Dict[str, Any]) -> None:
        existing_tags = runtime.collected_data.get("workflowTags")
        if isinstance(existing_tags, list):
            runtime_data["tags"] = {str(tag).strip() for tag in existing_tags if tag}
            runtime_data["_tags_loaded"] = True
        else:
            runtime_data["tags"] = set()

        existing_tag_values = runtime.collected_data.get("workflowTagValues")
        if isinstance(existing_tag_values, dict):
            runtime_data["tag_values"] = dict(existing_tag_values)

    def _persist_runtime_data(self, runtime: WorkflowRuntimeInput, runtime_data: Dict[str, Any]) -> None:
        tags = runtime_data.get("tags")
        if isinstance(tags, set):
            if tags:
                runtime.collected_data["workflowTags"] = sorted(tags)
            elif "workflowTags" in runtime.collected_data:
                runtime.collected_data.pop("workflowTags")

        tag_values = runtime_data.get("tag_values")
        if isinstance(tag_values, dict) and tag_values:
            runtime.collected_data["workflowTagValues"] = tag_values
        elif "workflowTagValues" in runtime.collected_data:
            runtime.collected_data.pop("workflowTagValues")

        tool_outputs = runtime_data.get("tool_outputs")
        if isinstance(tool_outputs, dict) and tool_outputs:
            combined = runtime.collected_data.get("workflowTools") or {}
            combined.update(tool_outputs)
            runtime.collected_data["workflowTools"] = combined

