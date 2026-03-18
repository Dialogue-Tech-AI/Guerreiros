"""
Horário de Brasília para uso nos prompts do agente.

Fornece placeholders que podem ser usados na configuração do prompt (Super Admin)
e são substituídos em tempo de execução pelo horário/data atuais no fuso do Brasil (Brasília).

Placeholders disponíveis (use no texto do prompt):
  {{horario_brasilia}}           → "14:32" (HH:MM)
  {{horario_brasilia_completo}}  → "14:32:15" (HH:MM:SS)
  {{data_brasilia}}              → "27/01/2025" (DD/MM/AAAA)
  {{data_hora_brasilia}}         → "27/01/2025 14:32" (DD/MM/AAAA HH:MM)
  {{data_extenso_brasilia}}      → "27 de janeiro de 2025"
  {{dia_semana_brasilia}}        → "Segunda-feira"
  {{dia_semana_curto_brasilia}}  → "Seg"
"""
from datetime import datetime
from typing import Dict

import pytz

ZONE_BRASILIA = "America/Sao_Paulo"
_TZ_BRASILIA = pytz.timezone(ZONE_BRASILIA)
DIAS_SEMANA = (
    "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira",
    "Sábado", "Domingo"
)
DIAS_SEMANA_CURTO = ("Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom")
MESES_EXTENSO = (
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
)


def _now_brasilia() -> datetime:
    """Retorna o datetime atual no fuso de Brasília."""
    return datetime.now(_TZ_BRASILIA)


def get_brasilia_placeholders() -> Dict[str, str]:
    """
    Retorna um dicionário de placeholder -> valor com data/hora atuais em Brasília.
    Útil para substituição em prompts configuráveis.
    """
    now = _now_brasilia()
    wd = now.weekday()  # 0=Monday, 6=Sunday
    return {
        "{{horario_brasilia}}": now.strftime("%H:%M"),
        "{{horario_brasilia_completo}}": now.strftime("%H:%M:%S"),
        "{{data_brasilia}}": now.strftime("%d/%m/%Y"),
        "{{data_hora_brasilia}}": now.strftime("%d/%m/%Y %H:%M"),
        "{{data_extenso_brasilia}}": f"{now.day} de {MESES_EXTENSO[now.month - 1]} de {now.year}",
        "{{dia_semana_brasilia}}": DIAS_SEMANA[wd],
        "{{dia_semana_curto_brasilia}}": DIAS_SEMANA_CURTO[wd],
    }


def apply_prompt_placeholders(text: str) -> str:
    """
    Substitui no texto todos os placeholders de horário de Brasília pelo valor atual.
    Placeholders são avaliados no momento da chamada (sempre horário corrente).

    Exemplo de uso no prompt (Super Admin):
      "Lembre-se: o horário atual no Brasil (Brasília) é {{horario_brasilia}} do dia {{data_brasilia}}."
    """
    if not text or not isinstance(text, str):
        return text or ""
    placeholders = get_brasilia_placeholders()
    result = text
    for placeholder, value in placeholders.items():
        result = result.replace(placeholder, value)
    return result
