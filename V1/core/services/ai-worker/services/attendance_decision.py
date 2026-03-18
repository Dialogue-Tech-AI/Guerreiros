"""
Serviço de decisão: reabrir atendimento existente vs criar novo.
Usado quando o cliente retorna e já tem atendimentos finalizados.
"""
from typing import List, Optional
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from config.settings import settings
from utils.logger import logger


class AttendanceDecision(BaseModel):
    """Resposta estruturada da IA para decidir reabrir vs novo atendimento."""
    action: str = Field(description="reopen se for continuação do último atendimento, new se for assunto novo")
    attendance_id: Optional[str] = Field(
        default=None,
        description="UUID do atendimento a reabrir; obrigatório quando action=reopen, deve ser um dos recent_attendance_ids"
    )


DECISION_SYSTEM = """Você decide se a mensagem do cliente é continuação de um atendimento anterior ou assunto novo.

- action "reopen": o cliente está dando sequência ao último atendimento (mesma peça, orçamento, pedido, dúvida).
- action "new": o cliente mudou de assunto, quer outra peça, outro orçamento, ou tema diferente.

Quando action=reopen, informe attendance_id com o UUID do atendimento mais recente (o primeiro da lista recent_attendance_ids) que faça sentido reabrir.
Quando action=new, attendance_id deve ser null.

Responda sempre em JSON com action e attendance_id (ou null)."""


async def run_decision(
    last_attendance_summary: str,
    content: str,
    recent_attendance_ids: List[str],
) -> dict:
    """
    Chama a IA para decidir reabrir vs novo atendimento.

    Args:
        last_attendance_summary: Resumo do último atendimento
        content: Mensagem atual do cliente
        recent_attendance_ids: Lista de UUIDs dos últimos atendimentos fechados (mais recente primeiro)

    Returns:
        {"action": "reopen"|"new", "attendanceId": str|None}
    """
    if not recent_attendance_ids:
        return {"action": "new", "attendanceId": None}

    llm = ChatOpenAI(
        model=settings.openai_model,
        temperature=0.1,
        api_key=settings.openai_api_key,
        timeout=15,
        max_retries=1,
    )
    structured_llm = llm.with_structured_output(AttendanceDecision, method="function_calling")

    human = (
        "Resumo do último atendimento do cliente:\n"
        f"{last_attendance_summary or '(sem resumo)'}\n\n"
        "Atendimentos recentes (mais recente primeiro):\n"
        + "\n".join(recent_attendance_ids)
        + "\n\n"
        "Mensagem atual do cliente:\n"
        f"{content}"
    )

    try:
        out = await structured_llm.ainvoke([
            SystemMessage(content=DECISION_SYSTEM),
            HumanMessage(content=human),
        ])
        action = (out.action or "new").strip().lower()
        if action not in ("reopen", "new"):
            action = "new"
        aid = out.attendance_id if action == "reopen" and out.attendance_id else None
        if action == "reopen" and not aid and recent_attendance_ids:
            aid = recent_attendance_ids[0]
        return {"action": action, "attendanceId": aid}
    except Exception as e:
        logger.warning("Attendance decision failed, defaulting to new: %s", e)
        return {"action": "new", "attendanceId": None}
