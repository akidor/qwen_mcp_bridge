import json
import httpx
import pytest
import respx
from unittest.mock import AsyncMock, MagicMock
from qwen_mcp_bridge.chat_loop import run_chat, MaxIterReached


def make_pool_mock(tool_results: dict[str, str]):
    """dispatch가 호출되면 tool_results[name]을 텍스트로 가진 CallToolResult 모방."""
    pool = MagicMock()
    pool.list_openai_tools.return_value = [
        {"type": "function", "function": {"name": k, "description": "", "parameters": {"type": "object"}}}
        for k in tool_results
    ]

    async def _dispatch(name, args):
        text = tool_results[name]
        # mcp CallToolResult: content=[TextContent(text=...)]
        content_item = MagicMock()
        content_item.text = text
        result = MagicMock()
        result.content = [content_item]
        result.isError = False
        return result

    pool.dispatch = AsyncMock(side_effect=_dispatch)
    return pool


@pytest.mark.asyncio
@respx.mock
async def test_run_chat_no_tool_call_returns_immediately():
    pool = make_pool_mock({"locate__search_address": "result"})

    respx.post("http://fake-vllm/v1/chat/completions").mock(
        return_value=httpx.Response(200, json={
            "id": "x", "object": "chat.completion", "model": "fake",
            "choices": [{"index": 0, "finish_reason": "stop", "message": {
                "role": "assistant", "content": "안녕하세요"
            }}],
        })
    )

    result = await run_chat(
        messages=[{"role": "user", "content": "안녕"}],
        pool=pool,
        vllm_base_url="http://fake-vllm/v1",
        vllm_api_key="x",
        model="fake",
        max_iterations=5,
    )
    assert result["choices"][0]["message"]["content"] == "안녕하세요"
    pool.dispatch.assert_not_called()


@pytest.mark.asyncio
@respx.mock
async def test_run_chat_one_tool_call_then_final():
    pool = make_pool_mock({"locate__search_address": '{"items":[{"pnu":"1234"}]}'})

    # 1번째 호출: tool_calls 응답
    # 2번째 호출: 최종 텍스트 응답
    route = respx.post("http://fake-vllm/v1/chat/completions").mock(
        side_effect=[
            httpx.Response(200, json={
                "id": "x", "object": "chat.completion", "model": "fake",
                "choices": [{"index": 0, "finish_reason": "tool_calls", "message": {
                    "role": "assistant", "content": None,
                    "tool_calls": [{
                        "id": "call_1", "type": "function",
                        "function": {"name": "locate__search_address", "arguments": '{"query":"역삼동"}'},
                    }],
                }}],
            }),
            httpx.Response(200, json={
                "id": "y", "object": "chat.completion", "model": "fake",
                "choices": [{"index": 0, "finish_reason": "stop", "message": {
                    "role": "assistant", "content": "PNU는 1234입니다."
                }}],
            }),
        ]
    )

    result = await run_chat(
        messages=[{"role": "user", "content": "역삼동 PNU 알려줘"}],
        pool=pool,
        vllm_base_url="http://fake-vllm/v1",
        vllm_api_key="x",
        model="fake",
        max_iterations=5,
    )
    assert result["choices"][0]["message"]["content"] == "PNU는 1234입니다."
    pool.dispatch.assert_awaited_once_with("locate__search_address", {"query": "역삼동"})
    assert route.call_count == 2


@pytest.mark.asyncio
@respx.mock
async def test_run_chat_max_iter_raises():
    """vLLM이 매번 tool_call만 반환 → max_iter 도달 시 MaxIterReached."""
    pool = make_pool_mock({"locate__search_address": "x"})

    respx.post("http://fake-vllm/v1/chat/completions").mock(
        return_value=httpx.Response(200, json={
            "id": "x", "object": "chat.completion", "model": "fake",
            "choices": [{"index": 0, "finish_reason": "tool_calls", "message": {
                "role": "assistant", "content": None,
                "tool_calls": [{
                    "id": "call_x", "type": "function",
                    "function": {"name": "locate__search_address", "arguments": "{}"},
                }],
            }}],
        })
    )

    with pytest.raises(MaxIterReached):
        await run_chat(
            messages=[{"role": "user", "content": "x"}],
            pool=pool,
            vllm_base_url="http://fake-vllm/v1",
            vllm_api_key="x",
            model="fake",
            max_iterations=3,
        )


@pytest.mark.asyncio
@respx.mock
async def test_run_chat_dispatch_error_becomes_tool_message():
    """dispatch 예외는 tool 결과 문자열로 변환되어 모델에게 전달, loop 진행."""
    pool = MagicMock()
    pool.list_openai_tools.return_value = [
        {"type": "function", "function": {"name": "locate__search_address",
         "description": "", "parameters": {"type": "object"}}}
    ]
    pool.dispatch = AsyncMock(side_effect=KeyError("도메인 'foo'은 풀에 없습니다"))

    respx.post("http://fake-vllm/v1/chat/completions").mock(
        side_effect=[
            httpx.Response(200, json={
                "id": "x", "object": "chat.completion", "model": "fake",
                "choices": [{"index": 0, "finish_reason": "tool_calls", "message": {
                    "role": "assistant", "content": None,
                    "tool_calls": [{
                        "id": "call_1", "type": "function",
                        "function": {"name": "foo__bar", "arguments": "{}"},
                    }],
                }}],
            }),
            httpx.Response(200, json={
                "id": "y", "object": "chat.completion", "model": "fake",
                "choices": [{"index": 0, "finish_reason": "stop", "message": {
                    "role": "assistant", "content": "도구 호출 실패함."
                }}],
            }),
        ]
    )

    result = await run_chat(
        messages=[{"role": "user", "content": "x"}],
        pool=pool,
        vllm_base_url="http://fake-vllm/v1",
        vllm_api_key="x",
        model="fake",
        max_iterations=5,
    )
    assert result["choices"][0]["message"]["content"] == "도구 호출 실패함."
    pool.dispatch.assert_awaited_once()
