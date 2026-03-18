"""
Report AI response costs to Node.js internal API.
Called by the message consumer after each flow run when cost_accumulator is present.
"""
import httpx
from config.settings import settings
from utils.logger import logger

# USD per 1M tokens (input, output). Source: OpenAI pricing, adjust as needed.
PRICING = {
    "gpt-4.1": (2.0, 8.0),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1-nano": (0.10, 0.40),  # Modelo correto da OpenAI
    "gpt-4o": (2.50, 10.0),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o-nano": (0.10, 0.40),  # Deprecado - mapeia para gpt-4.1-nano
    # Modelo ultra-econômico de próxima geração (estimativa conservadora)
    "gpt-5-nano": (0.05, 0.20),
    "gpt-4-turbo": (10.0, 30.0),
    "gpt-4": (30.0, 60.0),
    "gpt-3.5-turbo": (0.50, 1.50),
    "whisper-1": 0.006,  # per minute
}

DEFAULT_INPUT = 2.0
DEFAULT_OUTPUT = 8.0
WHISPER_PER_MIN = 0.006


def _usd_for_tokens(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    p = PRICING.get(model)
    if p is None:
        inp, out = DEFAULT_INPUT, DEFAULT_OUTPUT
    elif isinstance(p, (int, float)):
        inp, out = DEFAULT_INPUT, DEFAULT_OUTPUT
    else:
        inp, out = p
    return (prompt_tokens / 1e6 * inp) + (completion_tokens / 1e6 * out)


def _usd_for_whisper(minutes: float) -> float:
    return minutes * WHISPER_PER_MIN


async def report_ai_cost(
    node_api_url: str,
    internal_api_key: str,
    attendance_id: str,
    message_id: str | None,
    client_phone: str,
    scenario: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    whisper_minutes: float | None,
    usd_cost: float,
    brl_cost: float,
    router_model: str | None = None,
    router_prompt_tokens: int | None = None,
    router_completion_tokens: int | None = None,
    router_total_tokens: int | None = None,
    router_usd_cost: float | None = None,
    router_brl_cost: float | None = None,
    specialist_name: str | None = None,
    specialist_model: str | None = None,
    specialist_prompt_tokens: int | None = None,
    specialist_completion_tokens: int | None = None,
    specialist_total_tokens: int | None = None,
    specialist_usd_cost: float | None = None,
    specialist_brl_cost: float | None = None,
    execution_log: dict | None = None,
) -> bool:
    """POST cost record to Node /api/internal/ai-costs. Returns True on success."""
    if not node_api_url or not internal_api_key:
        logger.warning(
            "AI cost report skipped: NODE_API_URL or INTERNAL_API_KEY not set (check ai-worker .env)"
        )
        return False
    url = f"{node_api_url.rstrip('/')}/api/internal/ai-costs"
    payload = {
        "attendanceId": attendance_id,
        "messageId": message_id,
        "clientPhone": client_phone,
        "scenario": scenario,
        "model": model,
        "promptTokens": prompt_tokens,
        "completionTokens": completion_tokens,
        "totalTokens": total_tokens,
        "whisperMinutes": whisper_minutes,
        "usdCost": round(usd_cost, 6),
        "brlCost": round(brl_cost, 6),
    }
    # Multi-agent breakdown (optional)
    if router_model is not None:
        payload["routerModel"] = router_model
        payload["routerPromptTokens"] = int(router_prompt_tokens or 0)
        payload["routerCompletionTokens"] = int(router_completion_tokens or 0)
        payload["routerTotalTokens"] = int(router_total_tokens or 0)
        payload["routerUsdCost"] = round(float(router_usd_cost or 0), 6)
        payload["routerBrlCost"] = round(float(router_brl_cost or 0), 6)
    if specialist_model is not None or specialist_name is not None:
        payload["specialistName"] = specialist_name
        payload["specialistModel"] = specialist_model
        payload["specialistPromptTokens"] = int(specialist_prompt_tokens or 0)
        payload["specialistCompletionTokens"] = int(specialist_completion_tokens or 0)
        payload["specialistTotalTokens"] = int(specialist_total_tokens or 0)
        payload["specialistUsdCost"] = round(float(specialist_usd_cost or 0), 6)
        payload["specialistBrlCost"] = round(float(specialist_brl_cost or 0), 6)
    if execution_log is not None and isinstance(execution_log, dict):
        payload["executionLog"] = execution_log
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                url,
                json=payload,
                headers={
                    "X-Internal-Auth": internal_api_key,
                    "Content-Type": "application/json",
                },
            )
            r.raise_for_status()
            logger.info(
                "AI cost reported",
                extra={"attendanceId": attendance_id, "totalTokens": total_tokens, "usdCost": usd_cost},
            )
            return True
    except Exception as e:
        logger.warning("Failed to report AI cost: %s", e)
        return False


def compute_usd_brl(
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    model: str,
    whisper_minutes: float | None,
    usd_brl_rate: float = 5.5,
) -> tuple[float, float]:
    """Compute USD and BRL from token/whisper usage."""
    usd = _usd_for_tokens(model, prompt_tokens, completion_tokens)
    if whisper_minutes and whisper_minutes > 0:
        usd += _usd_for_whisper(whisper_minutes)
    brl = usd * usd_brl_rate
    return usd, brl
