"""Dynamic Function Call Tool - Tool genérica criada dinamicamente baseada nas function calls do banco"""
import json
from langchain.tools import BaseTool
from pydantic import BaseModel, Field, create_model, field_validator, model_validator
from typing import Type, Dict, Any, Optional, List
from utils.logger import logger
from services.agent_config_service import AgentConfigService


def _make_data_schema(
    function_call_name: str,
    required_fields: List[str],
    optional_fields: List[str],
) -> Type[BaseModel]:
    """Cria schema com campo 'data' OBRIGATÓRIO e descrição com chaves obrigatórias + opcionais."""
    all_keys = list(required_fields) + list(optional_fields)
    req_str = ", ".join(required_fields) if required_fields else "(nenhum)"
    opt_str = ", ".join(optional_fields) if optional_fields else "(nenhum)"
    keys_str = ", ".join(all_keys) if all_keys else ""

    desc = (
        "OBRIGATÓRIO. Objeto JSON com as chaves exatas: {keys}. "
        "Obrigatórias: {req}. Opcionais: {opt}. "
        "Preencha as obrigatórias com dados extraídos da conversa; opcionais se tiver. "
        "Acione a FC só quando todos os obrigatórios forem coletados. Nunca invoque com data vazio."
    ).format(keys=keys_str or "—", req=req_str, opt=opt_str)

    class _GenericInput(BaseModel):
        data: Dict[str, Any] = Field(default_factory=dict, description=desc)

        @model_validator(mode="before")
        @classmethod
        def wrap_if_no_data_key(cls, v: Any) -> Any:
            """Se a LLM passar o payload no topo (ex.: {'Resumo da conversa': '...'}), normaliza para {'data': ...}."""
            # Se for um dict sem a chave 'data', normaliza para {'data': ...}
            # Isso inclui o caso de dict vazio {} -> {'data': {}}
            if isinstance(v, dict):
                if "data" not in v:
                    # Normaliza dict sem 'data' para {'data': ...}
                    return {"data": v}
                # Se já tem 'data', retorna como está
                return v
            # Se não for dict, retorna como está (será tratado pelo field_validator)
            return v

        @field_validator("data", mode="before")
        @classmethod
        def parse_data_to_dict(cls, v: Any) -> Dict[str, Any]:
            if v is None:
                return {}
            if isinstance(v, dict):
                return v
            if isinstance(v, str) and v.strip():
                try:
                    parsed = json.loads(v)
                    return parsed if isinstance(parsed, dict) else {"raw": parsed}
                except json.JSONDecodeError:
                    return {"raw": v}
            return {}

    _GenericInput.__name__ = f"{function_call_name}_DataInput"
    return _GenericInput


class DynamicFunctionCallTool(BaseTool):
    """
    Tool genérica criada dinamicamente baseada nas function calls configuradas no banco
    Não tem código hardcoded - apenas executa e retorna resultado para processamento via outputs
    """

    name: str
    description: str
    args_schema: Type[BaseModel]

    def __init__(
        self,
        function_call_name: str,
        description: str,
        input_schema: Optional[Dict[str, Any]] = None,
        required_fields: Optional[List[str]] = None,
        optional_fields: Optional[List[str]] = None,
        agent_config_service: Optional[AgentConfigService] = None,
    ):
        """
        Cria uma tool dinâmica.

        Args:
            function_call_name: Nome da function call
            description: Descrição/prompt da function call (vem do banco)
            input_schema: Schema JSON opcional para parâmetros customizados
            required_fields: Chaves obrigatórias do 'data' (obrigatórios + opcionais = chaves do data)
            optional_fields: Chaves opcionais do 'data'
            agent_config_service: Serviço para carregar configurações
        """
        object.__setattr__(self, "_agent_config_service", agent_config_service)
        object.__setattr__(self, "_description_cache", None)
        req = required_fields or []
        opt = optional_fields or []

        if input_schema:
            from typing import Literal

            fields = {}
            for field_name, field_info in input_schema.items():
                field_type = field_info.get("type", "string")
                field_desc = field_info.get("description", "")
                required = field_info.get("required", True)
                enum_values = field_info.get("enum")

                if enum_values:
                    python_type = Literal[tuple(enum_values)]  # type: ignore
                else:
                    python_type = str
                    if field_type == "number" or field_type == "integer":
                        python_type = float if field_type == "number" else int
                    elif field_type == "boolean":
                        python_type = bool
                    elif field_type == "array":
                        python_type = list
                    elif field_type == "object":
                        python_type = dict

                if required:
                    fields[field_name] = (python_type, Field(description=field_desc))
                else:
                    fields[field_name] = (Optional[python_type], Field(default=None, description=field_desc))

            args_schema = create_model(f"{function_call_name}_Input", **fields)
        else:
            args_schema = _make_data_schema(function_call_name, req, opt)

        super().__init__(
            name=function_call_name,
            description=description,
            args_schema=args_schema,
        )
    
    async def _load_description(self):
        """Carrega descrição dinamicamente do banco"""
        svc = getattr(self, "_agent_config_service", None)
        if svc:
            try:
                prompt = await svc.get_function_call_prompt(self.name, force_reload=False)
                object.__setattr__(self, "_description_cache", prompt)
                self.description = prompt
            except Exception as e:
                logger.warning(f"Failed to load prompt for {self.name}, using current description: {e}")
    
    async def _arun(self, *args: Any, **kwargs: Any) -> str:
        """
        Executa a function call - apenas retorna o resultado
        O processamento real (código) acontece via outputs configurados no Super Admin
        O LangChain pode chamar com *tool_args (ex.: um dict ou string JSON) e **tool_kwargs.
        """
        # Normaliza input: executor pode passar tool_input como dict ou como string JSON
        if args and len(args) == 1:
            raw = args[0]
            if isinstance(raw, dict):
                kwargs = {**raw, **kwargs}
            elif isinstance(raw, str) and raw.strip():
                s = raw.strip()
                if (s.startswith('{') and s.endswith('}')) or (s.startswith('[') and s.endswith(']')):
                    try:
                        parsed = json.loads(s)
                        if isinstance(parsed, dict):
                            kwargs = {**parsed, **kwargs}
                    except json.JSONDecodeError:
                        pass
        a0 = args[0] if args else None
        logger.info(
            f"Function call {self.name} _arun received args_len={len(args)} kwargs_keys={list(kwargs.keys())} "
            f"args0_type={type(a0).__name__ if a0 is not None else 'N/A'}"
        )
        try:
            # Processa kwargs - tenta extrair valores de JSON strings se necessário
            processed_kwargs = {}
            for key, value in kwargs.items():
                # Se o valor for uma string que parece JSON, tenta fazer parse
                if isinstance(value, str) and value.strip().startswith('{') and value.strip().endswith('}'):
                    try:
                        parsed = json.loads(value)
                        # Se for um dict com uma única chave que corresponde ao nome do campo, extrai o valor
                        if isinstance(parsed, dict) and len(parsed) == 1:
                            # Tenta usar o valor do dict se a chave corresponder ao campo
                            for dict_key, dict_value in parsed.items():
                                if dict_key.lower() == key.lower() or dict_key.lower() == 'state' or dict_key.lower() == 'value':
                                    processed_kwargs[key] = dict_value
                                    logger.debug(f"Extracted value from JSON string for {key}: {dict_value}")
                                    break
                            else:
                                # Se não encontrou correspondência, mantém o valor original
                                processed_kwargs[key] = value
                        else:
                            # Se for um dict complexo, mantém como está
                            processed_kwargs[key] = parsed
                    except json.JSONDecodeError:
                        # Se não for JSON válido, mantém o valor original
                        processed_kwargs[key] = value
                else:
                    processed_kwargs[key] = value
            
            # Se tiver campo 'data', usa ele, senão usa todos os kwargs processados
            if 'data' in processed_kwargs and isinstance(processed_kwargs['data'], dict):
                result_data = processed_kwargs['data']
            else:
                result_data = processed_kwargs
            
            result_json = json.dumps(result_data, ensure_ascii=False)
            if not result_data:
                _kw = str(kwargs)[:300] if kwargs else "{}"
                _args = str(args)[:500] if args else "()"
                logger.warning(
                    f"Function call {self.name} executed with EMPTY params. "
                    f"kwargs_keys={list(kwargs.keys())} kwargs_preview={_kw} | args_preview={_args}"
                )
            else:
                logger.info(f"Function call {self.name} executed with params: {result_json[:500]}")
            
            # Retorna JSON string - o processamento real será feito via outputs
            return result_json
            
        except Exception as e:
            logger.error(f"Error executing function call {self.name}: {e}", exc_info=True)
            return json.dumps({"error": str(e)}, ensure_ascii=False)
    
    def _run(self, *args, **kwargs) -> str:
        """Versão síncrona - não usada"""
        raise NotImplementedError("Use async version")
