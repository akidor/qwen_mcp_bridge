"""Routing debug metadata for chat SSE clients."""
from __future__ import annotations

import re
from typing import Any

from qwen_mcp_bridge.query_policy import build_routing_hint


_PNU_DASH_RE = re.compile(r"\b\d{10}[-_]\d+[-_]\d+\b")
_PNU_19_RE = re.compile(r"\b\d{19}\b")
_PNU_ASK_RE = re.compile(r"(PNU|pnu|식별자|필지\s*코드|코드를?\s*알려|19\s*자리)")


def build_routing_debug(
    messages: list[dict[str, Any]],
    *,
    current_parcel: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Return compact route metadata that mirrors the active routing hint."""
    from qwen_mcp_bridge.intent import classify_intent

    routing_hint = ""
    if current_parcel is not None:
        routing_hint = build_routing_hint(messages, current_parcel=current_parcel) or ""
    if not routing_hint:
        routing_hint = _extract_embedded_routing_hint(messages) or build_routing_hint(messages) or ""
    if routing_hint and not _latest_user_requests_pnu(messages):
        routing_hint = _redact_pnu(routing_hint)
    debug: dict[str, str] = {
        "intent": classify_intent(
            messages,
            has_current_parcel_context=current_parcel is not None or "anchor_type=current_parcel" in routing_hint,
        ),
        "routing_hint": routing_hint,
    }
    if routing_hint:
        debug.update(_parse_routing_hint_fields(routing_hint))
    return debug


def _latest_user_requests_pnu(messages: list[dict[str, Any]]) -> bool:
    for message in reversed(messages):
        if message.get("role") != "user":
            continue
        content = message.get("content") or ""
        return isinstance(content, str) and bool(_PNU_ASK_RE.search(content))
    return False


def _redact_pnu(text: str) -> str:
    text = _PNU_DASH_RE.sub("(redacted)", text)
    return _PNU_19_RE.sub("(redacted)", text)


def _extract_embedded_routing_hint(messages: list[dict[str, Any]]) -> str | None:
    marker = "### 브릿지 라우팅 힌트"
    for message in messages:
        if message.get("role") != "system":
            continue
        content = message.get("content") or ""
        if not isinstance(content, str):
            continue
        start = content.rfind(marker)
        if start == -1:
            continue
        hint = content[start:].strip()
        end = hint.find("\n\n")
        if end != -1:
            hint = hint[:end].strip()
        return hint or None
    return None


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
