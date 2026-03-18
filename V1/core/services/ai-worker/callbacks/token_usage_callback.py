"""
Callback that accumulates token usage across LLM calls (agent + structured).
Supports token_usage, usage, usage_metadata (input_tokens/output_tokens) and AIMessage.usage_metadata.
"""
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult
from typing import Any

from utils.logger import logger


def _extract_usage(usage: dict) -> tuple[int, int, int]:
    """Return (prompt_tokens, completion_tokens, total_tokens)."""
    pt = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    ct = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
    tt = int(usage.get("total_tokens") or 0)
    if tt == 0 and (pt or ct):
        tt = pt + ct
    return pt, ct, tt


class TokenUsageCallback(BaseCallbackHandler):
    """Accumulates prompt_tokens, completion_tokens, total_tokens from each on_llm_end."""

    def __init__(self) -> None:
        super().__init__()
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.total_tokens = 0

    def on_llm_end(self, response: LLMResult, *, run_id: Any = None, parent_run_id: Any = None, **kwargs: Any) -> None:
        out = response.llm_output or {}
        usage = out.get("token_usage") or out.get("usage") or out.get("usage_metadata")
        if isinstance(usage, dict):
            pt, ct, tt = _extract_usage(usage)
            if pt or ct or tt:
                self.prompt_tokens += pt
                self.completion_tokens += ct
                self.total_tokens += tt
                logger.info("TokenUsageCallback: usage from llm_output", extra={"pt": pt, "ct": ct, "tt": tt})
                return
        for gen_list in (response.generations or []):
            for gen in gen_list:
                if hasattr(gen, "message") and gen.message and getattr(gen.message, "usage_metadata", None):
                    um = gen.message.usage_metadata or {}
                    if isinstance(um, dict):
                        pt, ct, tt = _extract_usage(um)
                        if pt or ct or tt:
                            self.prompt_tokens += pt
                            self.completion_tokens += ct
                            self.total_tokens += tt
                            logger.info("TokenUsageCallback: usage from message.usage_metadata", extra={"pt": pt, "ct": ct, "tt": tt})
                            return
        logger.warning("TokenUsageCallback: on_llm_end called but no usage found", extra={"llm_output_keys": list(out.keys()) if out else []})

    def to_dict(self) -> dict[str, int]:
        return {
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
        }
