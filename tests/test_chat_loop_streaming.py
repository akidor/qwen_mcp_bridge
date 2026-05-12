import json
import pytest
import respx
import httpx
from unittest.mock import AsyncMock, MagicMock
from qwen_mcp_bridge.chat_loop_streaming import run_chat_streaming


def make_pool_mock_with_tool(name: str, result_text: str):
    pool = MagicMock()
    pool.list_openai_tools.return_value = [
        {"type": "function", "function": {"name": name, "description": "", "parameters": {"type": "object"}}}
    ]

    async def _dispatch(_name, _args):
        item = MagicMock()
        item.text = result_text
        result = MagicMock()
        result.content = [item]
        result.isError = False
        return result

    pool.dispatch = AsyncMock(side_effect=_dispatch)
    return pool


@pytest.mark.asyncio
@respx.mock
async def test_max_iter_emits_friendly_content_chunk():
    """max_iter 도달 시 OpenAI delta 형식의 한국어 content chunk가 emit되어야 함."""
    pool = make_pool_mock_with_tool("locate__search_address", "x")

    # vLLM이 매번 tool_call만 반환 → 무한 루프 → max_iter (stream=True SSE 형식)
    sse_body = "\n".join([
        "data: " + json.dumps({
            "id": "x", "object": "chat.completion.chunk", "model": "fake",
            "choices": [{"index": 0, "delta": {
                "role": "assistant",
                "tool_calls": [{
                    "index": 0,
                    "id": "call_x",
                    "type": "function",
                    "function": {"name": "locate__search_address", "arguments": "{}"},
                }],
            }, "finish_reason": None}],
        }),
        "",
        "data: " + json.dumps({
            "id": "x", "object": "chat.completion.chunk", "model": "fake",
            "choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls"}],
        }),
        "",
        "data: [DONE]",
        "",
        "",
    ])
    respx.post("http://fake-vllm/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            text=sse_body,
        )
    )

    chunks: list[bytes] = []
    async for chunk in run_chat_streaming(
        messages=[{"role": "user", "content": "x"}],
        pool=pool,
        vllm_base_url="http://fake-vllm/v1",
        vllm_api_key="x",
        model="fake-model",
        max_iterations=2,
    ):
        chunks.append(chunk)

    body = b"".join(chunks).decode("utf-8")
    # max iter 친근 content chunk가 OpenAI 표준 형식으로 들어가야 함
    assert "chat.completion.chunk" in body
    assert "도구를 2번 호출" in body
    assert "최종 답변을 만들지 못했습니다" in body
    # status event도 함께
    assert "max_iterations=2" in body
    # [DONE]으로 마감
    assert "data: [DONE]" in body


@pytest.mark.asyncio
@respx.mock
async def test_tool_call_end_sse_includes_result_text():
    """tool_call_end SSE 이벤트에 result_text가 포함돼야 함 (frontend auto_layer용)."""
    pool = make_pool_mock_with_tool("locate__get_parcel", '{"pnu":"123","geometry":{"type":"Polygon","coordinates":[[[127,37],[127.01,37],[127.01,37.01],[127,37.01],[127,37]]]}}')

    respx.post("http://fake-vllm/v1/chat/completions").mock(
        side_effect=[
            httpx.Response(200, text=(
                'data: {"id":"x","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{"role":"assistant","content":null,"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"locate__get_parcel","arguments":"{\\"pnu\\":\\"123\\"}"}}]},"finish_reason":null}]}\n\n'
                'data: {"id":"x","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n'
                'data: [DONE]\n\n'
            )),
            httpx.Response(200, text=(
                'data: {"id":"y","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{"role":"assistant","content":"결과: PNU 123"},"finish_reason":null}]}\n\n'
                'data: {"id":"y","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
                'data: [DONE]\n\n'
            )),
        ]
    )

    chunks: list[bytes] = []
    async for chunk in run_chat_streaming(
        messages=[{"role": "user", "content": "x"}],
        pool=pool,
        vllm_base_url="http://fake-vllm/v1",
        vllm_api_key="x",
        model="fake-model",
        max_iterations=5,
    ):
        chunks.append(chunk)

    body = b"".join(chunks).decode("utf-8")
    # tool_call_end 이벤트에 result_text 포함
    assert "tool_call_end" in body
    assert "result_text" in body
    # geometry JSON이 텍스트 안에 들어가야 함
    assert "Polygon" in body


@pytest.mark.asyncio
@respx.mock
async def test_buildable_candidate_stream_filters_non_buildable_visual_result():
    result_text = json.dumps({
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": []},
                "properties": {"pnu": "road", "address": "도로필지", "jimok": "도"},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": []},
                "properties": {"pnu": "site", "address": "대지필지", "jimok": "대"},
            },
        ],
    }, ensure_ascii=False)
    pool = make_pool_mock_with_tool("analyze__find_parcels", result_text)

    respx.post("http://fake-vllm/v1/chat/completions").mock(
        side_effect=[
            httpx.Response(200, text=(
                'data: {"id":"x","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{"role":"assistant","content":null,"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"analyze__find_parcels","arguments":"{\\"lng\\":127,\\"lat\\":37,\\"radius_m\\":300}"}}]},"finish_reason":null}]}\n\n'
                'data: {"id":"x","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n'
                'data: [DONE]\n\n'
            )),
            httpx.Response(200, text=(
                'data: {"id":"y","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{"role":"assistant","content":"대지필지 후보입니다."},"finish_reason":null}]}\n\n'
                'data: {"id":"y","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
                'data: [DONE]\n\n'
            )),
        ]
    )

    chunks: list[bytes] = []
    async for chunk in run_chat_streaming(
        messages=[
            {
                "role": "system",
                "content": "post_filter=건축 의도 있음; 지목·용도지역 기준으로 건축 가능 후보를 우선 추천",
            },
            {"role": "user", "content": "다세대주택 후보 찾아줘"},
        ],
        pool=pool,
        vllm_base_url="http://fake-vllm/v1",
        vllm_api_key="x",
        model="fake-model",
        max_iterations=5,
    ):
        chunks.append(chunk)

    events = []
    for block in b"".join(chunks).decode("utf-8").split("\n\n"):
        if not block.startswith("data: "):
            continue
        payload = block.removeprefix("data: ").strip()
        if payload == "[DONE]":
            continue
        parsed = json.loads(payload)
        if parsed.get("type") == "tool_call_end":
            events.append(parsed)

    assert len(events) == 1
    visual = json.loads(events[0]["result_text"])
    assert [f["properties"]["pnu"] for f in visual["features"]] == ["site"]
    assert visual["visual_filter_applied"]["removed_jimok"] == {"도": 1}
