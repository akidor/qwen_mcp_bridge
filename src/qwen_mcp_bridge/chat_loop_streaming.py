"""tool_call dispatch 루프 — SSE 스트리밍 버전.

설계:
- 각 iteration마다 vLLM에 stream=true로 호출.
- chunk를 파싱해 delta.tool_calls / delta.content / delta.reasoning_content를 분리.
- delta.content는 그대로 클라이언트에 forward (live streaming).
- delta.reasoning_content는 별도 SSE 이벤트로 forward (회색/접기 UI 처리용).
- delta.tool_calls는 누적만 하고 클라이언트에는 status 이벤트로 알림.
- finish_reason='tool_calls'면 dispatch 후 다음 iter로.
- finish_reason='stop'이면 [DONE]으로 마감.

SSE 이벤트 종류:
- 일반 OpenAI delta chunk (data: {"id":..., "choices":[{"delta":{"content":"..."}}]}\n\n)
- status: data: {"type":"status", "message":"..."}\n\n  (커스텀)
- tool_call: data: {"type":"tool_call", "name":..., "args":..., "duration_ms":...}\n\n  (커스텀)
- 마감: data: [DONE]\n\n
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, AsyncIterator

import httpx

from qwen_mcp_bridge._tool_result import truncate_tool_text


logger = logging.getLogger(__name__)


def _extract_tool_text(result: Any) -> str:
    content = getattr(result, "content", None) or []
    parts: list[str] = []
    for item in content:
        text = getattr(item, "text", None)
        if text is not None:
            parts.append(text)
    return "\n".join(parts) if parts else ""


def _sse(data: dict | str) -> bytes:
    """OpenAI SSE 라인 한 줄 (data: ... \\n\\n) 인코딩."""
    if isinstance(data, str):
        return f"data: {data}\n\n".encode()
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n".encode()


def _merge_tool_call_delta(acc: list[dict], delta_tool_calls: list[dict]) -> None:
    """OpenAI streaming의 tool_calls delta 병합. delta는 index 기준으로 동일 index에 합쳐짐."""
    for tc in delta_tool_calls:
        idx = tc.get("index", 0)
        while len(acc) <= idx:
            acc.append({"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
        slot = acc[idx]
        if tc.get("id"):
            slot["id"] = tc["id"]
        if tc.get("type"):
            slot["type"] = tc["type"]
        fn = tc.get("function") or {}
        if fn.get("name"):
            slot["function"]["name"] += fn["name"]
        if fn.get("arguments") is not None:
            slot["function"]["arguments"] += fn["arguments"]


async def _stream_vllm_iter(
    client: httpx.AsyncClient,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict],
    tools: list[dict],
    extra_body: dict | None = None,
) -> AsyncIterator[dict]:
    """vLLM에 stream=true로 호출하고 chunk dict들을 yield.

    yield 마지막은 finish 정보 포함하는 sentinel dict:
    {"_finish_reason": "tool_calls" | "stop" | ..., "_tool_calls": [...], "_assistant_msg_for_history": {...}}
    """
    payload = {
        "model": model,
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
        "stream": True,
        "stream_options": {"include_usage": False},
    }
    if extra_body:
        # 클라이언트가 보낸 chat_template_kwargs 등 vLLM 전용 필드를 forward.
        # 우리 메타 키(`messages`, `model`, `stream`, `tools`, `tool_choice`)는 덮어쓰지 않음.
        for k, v in extra_body.items():
            if k in {"messages", "model", "stream", "tools", "tool_choice"}:
                continue
            payload[k] = v
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }

    accumulated_tool_calls: list[dict] = []
    accumulated_content_parts: list[str] = []
    accumulated_reasoning_parts: list[str] = []
    finish_reason: str | None = None

    async with client.stream(
        "POST",
        f"{base_url}/chat/completions",
        json=payload,
        headers=headers,
    ) as resp:
        resp.raise_for_status()
        async for line in resp.aiter_lines():
            if not line:
                continue
            if not line.startswith("data:"):
                continue
            payload_str = line[len("data:"):].strip()
            if payload_str == "[DONE]":
                break
            try:
                chunk = json.loads(payload_str)
            except json.JSONDecodeError:
                logger.warning("vLLM SSE chunk JSON 파싱 실패: %s", payload_str[:200])
                continue

            choices = chunk.get("choices") or []
            if not choices:
                continue
            choice = choices[0]
            delta = choice.get("delta") or {}

            if delta.get("tool_calls"):
                _merge_tool_call_delta(accumulated_tool_calls, delta["tool_calls"])

            if delta.get("content") is not None:
                accumulated_content_parts.append(delta["content"])

            # vLLM은 reasoning_parser=qwen3에서 `reasoning` 필드 사용. OpenAI 신규 스펙은 `reasoning_content`.
            # 둘 중 어느 쪽이든 호환.
            reasoning_chunk = delta.get("reasoning_content") or delta.get("reasoning")
            if reasoning_chunk is not None:
                accumulated_reasoning_parts.append(reasoning_chunk)

            if choice.get("finish_reason"):
                finish_reason = choice["finish_reason"]

            yield {"_chunk": chunk, "_choice": choice, "_delta": delta}

    # 히스토리에 다시 넣기 위한 재구성
    assistant_msg: dict = {"role": "assistant"}
    content = "".join(accumulated_content_parts)
    if content:
        assistant_msg["content"] = content
    else:
        assistant_msg["content"] = None
    if accumulated_tool_calls:
        # 깨끗하게 정리 (id/type 누락된 슬롯 보정)
        cleaned = []
        for i, tc in enumerate(accumulated_tool_calls):
            cleaned.append({
                "id": tc.get("id") or f"call_{i}",
                "type": tc.get("type") or "function",
                "function": {
                    "name": tc.get("function", {}).get("name") or "",
                    "arguments": tc.get("function", {}).get("arguments") or "{}",
                },
            })
        assistant_msg["tool_calls"] = cleaned

    yield {
        "_finish_reason": finish_reason,
        "_tool_calls": accumulated_tool_calls,
        "_content": content,
        "_reasoning": "".join(accumulated_reasoning_parts),
        "_assistant_msg_for_history": assistant_msg,
    }


async def run_chat_streaming(
    *,
    messages: list[dict],
    pool: Any,
    vllm_base_url: str,
    vllm_api_key: str,
    model: str,
    max_iterations: int = 5,
    request_timeout: float = 180.0,
    extra_body: dict | None = None,
    max_tool_result_bytes: int = 0,
) -> AsyncIterator[bytes]:
    """SSE byte chunks를 yield. FastAPI StreamingResponse로 forward."""
    work = list(messages)
    tools = pool.list_openai_tools()

    async with httpx.AsyncClient(timeout=request_timeout) as client:
        for iteration in range(max_iterations):
            sentinel: dict | None = None
            async for item in _stream_vllm_iter(
                client, vllm_base_url, vllm_api_key, model, work, tools,
                extra_body=extra_body,
            ):
                if "_chunk" in item:
                    chunk = item["_chunk"]
                    delta = item["_delta"]
                    # delta.content / reasoning_content / tool_calls 모두 그대로 전달.
                    # 클라이언트가 분리해서 렌더링.
                    yield _sse(chunk)
                else:
                    sentinel = item

            if sentinel is None:
                yield _sse({"type": "status", "message": "vLLM 스트림이 비어있음"})
                yield _sse("[DONE]")
                return

            finish = sentinel.get("_finish_reason")
            assistant_msg = sentinel["_assistant_msg_for_history"]

            if finish != "tool_calls":
                # stop / length / 기타 — 종료
                yield _sse("[DONE]")
                return

            # tool_calls — dispatch 후 다음 iter
            work.append(assistant_msg)
            for tc in assistant_msg.get("tool_calls") or []:
                name = tc["function"]["name"]
                raw_args = tc["function"].get("arguments") or "{}"
                args_preview = raw_args if len(raw_args) <= 80 else raw_args[:77] + "..."

                yield _sse({
                    "type": "tool_call_start",
                    "name": name,
                    "args_preview": args_preview,
                })

                t0 = time.monotonic()
                try:
                    parsed_args = json.loads(raw_args)
                except json.JSONDecodeError as e:
                    parsed_args = {}
                    tool_text = f"인자 JSON 파싱 실패: {e}"
                    logger.warning("tool_call args JSON 파싱 실패: %s", e)
                    err = True
                else:
                    try:
                        result = await pool.dispatch(name, parsed_args)
                        tool_text = _extract_tool_text(result)
                        err = False
                    except Exception as e:
                        tool_text = f"도구 호출 오류: {e}"
                        logger.warning("dispatch 오류 (%s): %s", name, e)
                        err = True

                tool_text = truncate_tool_text(tool_text, max_tool_result_bytes)
                duration_ms = int((time.monotonic() - t0) * 1000)

                # T5: result_text도 SSE에 첨부 — frontend auto_layer가 GeoJSON 추출에 사용.
                # 8KB cap (max-size guard와 별도, frontend 전송용 hard cap).
                _RESULT_TEXT_SSE_CAP = 8192
                tool_text_for_sse = tool_text
                if len(tool_text_for_sse.encode("utf-8")) > _RESULT_TEXT_SSE_CAP:
                    enc = tool_text_for_sse.encode("utf-8")[:_RESULT_TEXT_SSE_CAP]
                    while enc:
                        try:
                            tool_text_for_sse = enc.decode("utf-8")
                            break
                        except UnicodeDecodeError:
                            enc = enc[:-1]
                    else:
                        tool_text_for_sse = ""

                yield _sse({
                    "type": "tool_call_end",
                    "name": name,
                    "duration_ms": duration_ms,
                    "result_size": len(tool_text),
                    "result_text": tool_text_for_sse,
                    "error": err,
                })

                work.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": tool_text,
                })

        # max iter — friendly 한국어 content chunk를 OpenAI delta 형식으로 emit
        friendly = (
            f"도구를 {max_iterations}번 호출했지만 최종 답변을 만들지 못했습니다. "
            f"질문을 더 구체적으로 다시 시도해 주세요 (예: 좁은 범위·필지·필터 명시)."
        )
        yield _sse({
            "id": "bridge-maxiter",
            "object": "chat.completion.chunk",
            "model": model,
            "choices": [{
                "index": 0,
                "delta": {"role": "assistant", "content": friendly},
                "finish_reason": "stop",
            }],
        })
        yield _sse({
            "type": "status",
            "message": f"max_iterations={max_iterations} 도달",
        })
        yield _sse("[DONE]")
