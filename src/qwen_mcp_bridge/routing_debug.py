"""Routing debug metadata for chat SSE clients."""
from __future__ import annotations

from typing import Any

from qwen_mcp_bridge.query_policy import build_routing_hint


def build_routing_debug(messages: list[dict[str, Any]]) -> dict[str, str]:
    """Return compact route metadata that mirrors the active routing hint."""
    from qwen_mcp_bridge.intent import classify_intent

    routing_hint = build_routing_hint(messages) or ""
    debug: dict[str, str] = {
        "intent": classify_intent(messages),
        "routing_hint": routing_hint,
    }
    if routing_hint:
        debug.update(_parse_routing_hint_fields(routing_hint))
    return debug


def _parse_routing_hint_fields(routing_hint: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for raw_line in routing_hint.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("###") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if key and value:
            fields[key] = value
    return fields
