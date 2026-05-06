"""tool_call dispatch 루프."""
from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from qwen_mcp_bridge._tool_result import truncate_tool_text


class MaxIterReached(RuntimeError):
    """tool_call 루프가 max_iterations에 도달."""


logger = logging.getLogger(__name__)


def _extract_tool_text(result: Any) -> str:
    """mcp CallToolResult.content를 단일 문자열로 직렬화.
    content는 TextContent 리스트 또는 빈 리스트."""
    content = getattr(result, "content", None) or []
    parts: list[str] = []
    for item in content:
        text = getattr(item, "text", None)
        if text is not None:
            parts.append(text)
    return "\n".join(parts) if parts else ""


async def _call_vllm(
    client: httpx.AsyncClient,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict],
    tools: list[dict],
) -> dict:
    payload = {
        "model": model,
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    resp = await client.post(
        f"{base_url}/chat/completions",
        json=payload,
        headers=headers,
    )
    resp.raise_for_status()
    return resp.json()


async def run_chat(
    *,
    messages: list[dict],
    pool: Any,
    vllm_base_url: str,
    vllm_api_key: str,
    model: str,
    max_iterations: int = 5,
    request_timeout: float = 120.0,
    max_tool_result_bytes: int = 0,
) -> dict:
    """OpenAI 호환 응답 dict 반환. messages는 함수 안에서 mutate되지 않음."""
    work = list(messages)
    tools = pool.list_openai_tools()

    async with httpx.AsyncClient(timeout=request_timeout) as client:
        for iteration in range(max_iterations):
            response_json = await _call_vllm(
                client, vllm_base_url, vllm_api_key, model, work, tools,
            )
            choice = response_json["choices"][0]
            msg = choice["message"]
            tool_calls = msg.get("tool_calls") or []

            if not tool_calls:
                return response_json

            # assistant message + tool 결과들을 work에 추가
            work.append(msg)

            for call in tool_calls:
                name = call["function"]["name"]
                raw_args = call["function"].get("arguments") or "{}"
                try:
                    parsed_args = json.loads(raw_args)
                except json.JSONDecodeError as e:
                    parsed_args = {}
                    tool_text = f"인자 JSON 파싱 실패: {e}"
                    logger.warning("tool_call args JSON 파싱 실패: %s", e)
                else:
                    try:
                        result = await pool.dispatch(name, parsed_args)
                        tool_text = _extract_tool_text(result)
                    except Exception as e:
                        tool_text = f"도구 호출 오류: {e}"
                        logger.warning("dispatch 오류 (%s): %s", name, e)

                tool_text = truncate_tool_text(tool_text, max_tool_result_bytes)
                work.append({
                    "role": "tool",
                    "tool_call_id": call["id"],
                    "content": tool_text,
                })

        raise MaxIterReached(
            f"max_iterations={max_iterations} 도달 — 최종 답변을 받지 못함"
        )
