"""MCP Tool ↔ OpenAI function 정의 변환."""
from __future__ import annotations
from typing import Any


PREFIX_SEP = "__"


class PrefixError(ValueError):
    """tool 이름이 <domain>__<tool> 형식이 아닐 때."""


def mcp_tool_to_openai(tool: Any, domain: str) -> dict:
    """MCP Tool 객체를 OpenAI tool 정의로 변환.

    `tool`은 `name: str`, `description: str | None`, `inputSchema: dict | None`을
    가진 객체 (mcp.types.Tool 또는 SimpleNamespace).
    """
    name = f"{domain}{PREFIX_SEP}{tool.name}"
    description = tool.description or ""
    schema = tool.inputSchema or {"type": "object", "properties": {}}
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": schema,
        },
    }


def parse_prefixed_name(name: str) -> tuple[str, str]:
    """`<domain>__<tool>`을 (domain, tool) 튜플로 분해.

    raises PrefixError if format invalid.
    """
    if PREFIX_SEP not in name:
        raise PrefixError(f"prefix separator '{PREFIX_SEP}'가 없습니다: {name!r}")
    domain, _, tool_name = name.partition(PREFIX_SEP)
    if not domain:
        raise PrefixError(f"domain prefix가 비어있습니다: {name!r}")
    if not tool_name:
        raise PrefixError(f"tool 이름이 비어있습니다: {name!r}")
    return domain, tool_name
