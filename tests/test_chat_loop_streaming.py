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


def tool_call_end_events(chunks: list[bytes]) -> list[dict]:
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
    return events


def custom_events(chunks: list[bytes], event_type: str) -> list[dict]:
    events = []
    for block in b"".join(chunks).decode("utf-8").split("\n\n"):
        if not block.startswith("data: "):
            continue
        payload = block.removeprefix("data: ").strip()
        if payload == "[DONE]":
            continue
        parsed = json.loads(payload)
        if parsed.get("type") == event_type:
            events.append(parsed)
    return events


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
async def test_stream_emits_routing_debug_before_model_chunks():
    pool = make_pool_mock_with_tool("analyze__existing_building_statistics", "{}")
    respx.post("http://fake-vllm/v1/chat/completions").mock(
        return_value=httpx.Response(200, text=(
            'data: {"id":"y","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{"role":"assistant","content":"통계입니다."},"finish_reason":null}]}\n\n'
            'data: {"id":"y","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
            'data: [DONE]\n\n'
        ))
    )

    chunks: list[bytes] = []
    async for chunk in run_chat_streaming(
        messages=[{"role": "user", "content": "문정동 118-15 근처에 다세대주택 얼마나 있어?"}],
        pool=pool,
        vllm_base_url="http://fake-vllm/v1",
        vllm_api_key="x",
        model="fake-model",
        max_iterations=5,
    ):
        chunks.append(chunk)

    routing_events = custom_events(chunks, "routing_debug")

    assert len(routing_events) == 1
    assert routing_events[0]["intent"] == "existing_building_stats"
    assert routing_events[0]["bucket"] == "기존 건축물 통계 조회"
    assert routing_events[0]["anchor_type"] == "address"
    assert routing_events[0]["anchor_text"] == "문정동 118-15"
    assert "analyze__existing_building_statistics" in routing_events[0]["required_chain"]


@pytest.mark.asyncio
@respx.mock
async def test_stream_routing_debug_uses_current_parcel_context_for_recent_followup():
    pool = make_pool_mock_with_tool("analyze__existing_building_statistics", "{}")
    respx.post("http://fake-vllm/v1/chat/completions").mock(
        return_value=httpx.Response(200, text=(
            'data: {"id":"y","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{"role":"assistant","content":"통계입니다."},"finish_reason":null}]}\n\n'
            'data: {"id":"y","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
            'data: [DONE]\n\n'
        ))
    )

    chunks: list[bytes] = []
    async for chunk in run_chat_streaming(
        messages=[{"role": "user", "content": "방금 그거 주변 다세대주택 얼마나 있어?"}],
        pool=pool,
        vllm_base_url="http://fake-vllm/v1",
        vllm_api_key="x",
        model="fake-model",
        max_iterations=5,
        current_parcel_context={
            "address": "서울특별시 강남구 역삼동 738-1",
            "pnu": "1168010100107380001",
            "centroid": {"lng": 127.0331234, "lat": 37.4989876},
        },
    ):
        chunks.append(chunk)

    routing_events = custom_events(chunks, "routing_debug")

    assert len(routing_events) == 1
    assert routing_events[0]["intent"] == "existing_building_stats"
    assert routing_events[0]["anchor_type"] == "current_parcel"
    assert routing_events[0]["anchor_text"] == "서울특별시 강남구 역삼동 738-1"
    assert routing_events[0]["current_parcel_pnu"] == "(redacted)"
    assert routing_events[0]["current_parcel_centroid"] == "127.033123,37.498988"


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
async def test_existing_building_statistics_stream_splits_model_stats_from_visual_features():
    feature = {
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": [[[127, 37], [127.001, 37], [127.001, 37.001], [127, 37.001], [127, 37]]]},
        "properties": {"pnu": "p1", "address": "문정동 118-15", "matched_use": "다세대주택"},
    }
    result_text = json.dumps({
        "type": "FeatureCollection",
        "matched_buildings": 1,
        "coverage": "full",
        "parcels_probed": 80,
        "features": [feature],
        "detail_probe_log": "x" * 300_000,
    }, ensure_ascii=False)
    pool = make_pool_mock_with_tool("analyze__existing_building_statistics", result_text)

    respx.post("http://fake-vllm/v1/chat/completions").mock(
        side_effect=[
            httpx.Response(200, text=(
                'data: {"id":"x","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{"role":"assistant","content":null,"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"analyze__existing_building_statistics","arguments":"{\\"lng\\":127,\\"lat\\":37,\\"radius_m\\":300}"}}]},"finish_reason":null}]}\n\n'
                'data: {"id":"x","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n'
                'data: [DONE]\n\n'
            )),
            httpx.Response(200, text=(
                'data: {"id":"y","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{"content":"총 1개소입니다."},"finish_reason":null}]}\n\n'
                'data: {"id":"y","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
                'data: [DONE]\n\n'
            )),
        ]
    )

    chunks: list[bytes] = []
    async for chunk in run_chat_streaming(
        messages=[{"role": "user", "content": "문정동 118-15 근처에 다세대주택 얼마나 있어?"}],
        pool=pool,
        vllm_base_url="http://fake-vllm/v1",
        vllm_api_key="x",
        model="fake-model",
        max_iterations=5,
        max_tool_result_bytes=1_000_000,
    ):
        chunks.append(chunk)

    events = tool_call_end_events(chunks)
    visual = json.loads(events[0]["result_text"])
    assert visual["type"] == "FeatureCollection"
    assert visual["matched_buildings"] == 1
    assert visual["features"][0]["properties"]["pnu"] == "p1"
    assert "detail_probe_log" not in visual
    assert len(events[0]["result_text"].encode("utf-8")) < 262_144

    second_payload = json.loads(respx.calls[1].request.content)
    model_tool_messages = [message for message in second_payload["messages"] if message["role"] == "tool"]
    model_result = json.loads(model_tool_messages[-1]["content"])
    assert model_result["matched_buildings"] == 1
    assert model_result["features_omitted_for_model"] == 1
    assert "features" not in model_result
    assert "detail_probe_log" in model_result


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

    events = tool_call_end_events(chunks)

    assert len(events) == 1
    visual = json.loads(events[0]["result_text"])
    assert [f["properties"]["pnu"] for f in visual["features"]] == ["site"]
    assert visual["visual_filter_applied"]["removed_jimok"] == {"도": 1}


@pytest.mark.asyncio
@respx.mock
async def test_buildable_candidate_stream_filters_when_user_message_has_build_intent():
    result_text = json.dumps({
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": []},
                "properties": {"pnu": "road", "address": "양재동 349-9", "jimok": "도로"},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": []},
                "properties": {"pnu": "site", "address": "양재동 344-7", "jimok": "대지"},
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
                'data: {"id":"y","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{"content":"대지필지 후보입니다."},"finish_reason":null}]}\n\n'
                'data: {"id":"y","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
                'data: [DONE]\n\n'
            )),
        ]
    )

    chunks: list[bytes] = []
    async for chunk in run_chat_streaming(
        messages=[{"role": "user", "content": "양재동 344-7 주변 다세대주택 신축 후보 필지 찾아줘"}],
        pool=pool,
        vllm_base_url="http://fake-vllm/v1",
        vllm_api_key="x",
        model="fake-model",
        max_iterations=5,
    ):
        chunks.append(chunk)

    events = tool_call_end_events(chunks)

    assert len(events) == 1
    visual = json.loads(events[0]["result_text"])
    assert [f["properties"]["pnu"] for f in visual["features"]] == ["site"]
    assert visual["visual_filter_applied"]["removed_jimok"] == {"도로": 1}


@pytest.mark.asyncio
@respx.mock
async def test_existing_multifamily_search_suppresses_find_parcels_visual_result():
    result_text = json.dumps({
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": []},
                "properties": {"pnu": "road", "address": "양재동 349-9", "jimok": "도로"},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": []},
                "properties": {"pnu": "site", "address": "양재동 344-7", "jimok": "대지"},
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
                'data: {"id":"y","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{"content":"확인된 기존 다세대주택만 정리합니다."},"finish_reason":null}]}\n\n'
                'data: {"id":"y","object":"chat.completion.chunk","model":"fake","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
                'data: [DONE]\n\n'
            )),
        ]
    )

    chunks: list[bytes] = []
    async for chunk in run_chat_streaming(
        messages=[{"role": "user", "content": "양재동 344-7근처 다세대주택"}],
        pool=pool,
        vllm_base_url="http://fake-vllm/v1",
        vllm_api_key="x",
        model="fake-model",
        max_iterations=5,
    ):
        chunks.append(chunk)

    events = tool_call_end_events(chunks)

    assert len(events) == 1
    visual = json.loads(events[0]["result_text"])
    assert visual["features"] == []
    assert visual["total_before_visual_suppress"] == 2
    assert visual["visual_suppressed"]["reason"] == "existing_building_search_intermediate_parcels"
