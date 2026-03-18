"""Tools package for the Altese AI Worker

APENAS tools dinâmicas - todas as function calls são criadas via Super Admin
"""

from .dynamic_function_call_tool import DynamicFunctionCallTool

__all__ = [
    "DynamicFunctionCallTool",
]
