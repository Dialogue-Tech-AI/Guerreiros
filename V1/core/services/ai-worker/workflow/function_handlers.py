from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Callable, Awaitable, Set

from utils.logger import logger
from utils.postgres_client import pg_client


@dataclass
class HandlerContext:
    """Context passed to workflow function handlers."""

    attendance_id: str
    params: Dict[str, Any]
    runtime_data: Dict[str, Any]
    collected_data: Dict[str, Any]

    def _log_once(self, key: str, message: str) -> None:
        flags = self.runtime_data.setdefault("_handler_warnings", set())
        if key not in flags:
            logger.warning(message)
            flags.add(key)

    async def ensure_tags_loaded(self) -> Set[str]:
        """
        Lazy-load tags for the attendance, caching inside runtime_data.
        """
        tags_set: Set[str] = self.runtime_data.setdefault("tags", set())
        if tags_set or self.runtime_data.get("_tags_loaded"):
            return tags_set

        if not pg_client.pool:
            self._log_once(
                "tags_pg_connection",
                "Workflow handler: conexão com PostgreSQL indisponível; tags não serão carregadas.",
            )
            self.runtime_data["_tags_loaded"] = True
            return tags_set

        try:
            row = await pg_client.fetchrow(
                """
                SELECT custom_attributes
                FROM attendances
                WHERE id = $1
                """,
                self.attendance_id,
            )
            if row:
                custom = row.get("custom_attributes")
                if isinstance(custom, dict):
                    possible = custom.get("workflowTags") or custom.get("tags") or []
                    if isinstance(possible, list):
                        tags_set.update(str(item).strip() for item in possible if item)
            self.runtime_data["_tags_loaded"] = True
        except Exception as exc:
            self._log_once(
                "tags_load_error",
                f"Workflow handler: erro ao carregar tags do atendimento {self.attendance_id}: {exc}",
            )
            self.runtime_data["_tags_loaded"] = True
        return tags_set

    def register_tag_value(self, tag_key: str, tag_value: Optional[str]) -> None:
        """
        Store tag metadata to be persisted/returned after workflow execution.
        """
        meta = self.runtime_data.setdefault("tag_values", {})
        if tag_value is not None and str(tag_value).strip():
            meta[tag_key] = str(tag_value).strip()
        elif tag_key in meta:
            del meta[tag_key]


@dataclass
class FunctionHandlerOutcome:
    """Outcome produced by a workflow function handler."""

    next_handle: Optional[str] = None
    success: Optional[bool] = None
    context_updates: Dict[str, Any] = field(default_factory=dict)
    logs: list[str] = field(default_factory=list)


async def check_attendance_tag(ctx: HandlerContext) -> FunctionHandlerOutcome:
    """
    Handler que verifica se o atendimento possui uma tag específica.
    Params esperados:
      - tagKey (str): chave da tag
      - trueHandle / falseHandle (opcionais): handles customizados
    Retorna next_handle indicando o caminho.
    """
    tag_key = str(ctx.params.get("tagKey", "")).strip()
    if not tag_key:
        ctx._log_once(
            "missing_tagKey",
            "Workflow handler check_attendance_tag chamado sem tagKey definido.",
        )
        return FunctionHandlerOutcome(next_handle=ctx.params.get("fallbackHandle"), success=False)

    tags = await ctx.ensure_tags_loaded()
    exists = tag_key in tags

    true_handle = ctx.params.get("trueHandle")
    false_handle = ctx.params.get("falseHandle")

    if exists:
        next_handle = true_handle or ctx.params.get("successHandle") or "tem"
    else:
        next_handle = false_handle or ctx.params.get("failureHandle") or "nao_tem"

    return FunctionHandlerOutcome(next_handle=next_handle, success=exists)


async def add_tag(ctx: HandlerContext) -> FunctionHandlerOutcome:
    """
    Adiciona uma tag ao atendimento (contexto local do workflow).
    Params:
      - tagKey (str) obrigatório
      - tagValue (str) opcional
      - nextHandle (str) opcional
    """
    tag_key = str(ctx.params.get("tagKey", "")).strip()
    if not tag_key:
        ctx._log_once("add_tag_missing_key", "Workflow handler add_tag chamado sem tagKey.")
        return FunctionHandlerOutcome(next_handle=ctx.params.get("fallbackHandle"), success=False)

    tag_value = ctx.params.get("tagValue")
    tags = await ctx.ensure_tags_loaded()
    tags.add(tag_key)
    ctx.register_tag_value(tag_key, tag_value)
    ctx.runtime_data["tags_modified"] = True

    next_handle = ctx.params.get("nextHandle") or ctx.params.get("successHandle") or "success"
    return FunctionHandlerOutcome(next_handle=next_handle, success=True)


async def remove_tag(ctx: HandlerContext) -> FunctionHandlerOutcome:
    """
    Remove uma tag do atendimento (contexto local).
    Params:
      - tagKey (str) obrigatório
      - nextHandle (str) opcional
    """
    tag_key = str(ctx.params.get("tagKey", "")).strip()
    if not tag_key:
        ctx._log_once("remove_tag_missing_key", "Workflow handler remove_tag chamado sem tagKey.")
        return FunctionHandlerOutcome(next_handle=ctx.params.get("fallbackHandle"), success=False)

    tags = await ctx.ensure_tags_loaded()
    if tag_key in tags:
        tags.remove(tag_key)
        ctx.register_tag_value(tag_key, None)
        ctx.runtime_data["tags_modified"] = True
        success = True
    else:
        success = False

    next_handle = ctx.params.get("nextHandle") or (
        ctx.params.get("successHandle") if success else ctx.params.get("failureHandle")
    )
    if not next_handle:
        next_handle = "removed" if success else "not_found"

    return FunctionHandlerOutcome(next_handle=next_handle, success=success)


FUNCTION_HANDLERS: Dict[str, Callable[[HandlerContext], Awaitable[FunctionHandlerOutcome]]] = {
    "check_attendance_tag": check_attendance_tag,
    "add_tag": add_tag,
    "remove_tag": remove_tag,
}
