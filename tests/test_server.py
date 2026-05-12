import httpx
import pytest
import respx
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock
from fastapi.testclient import TestClient
from qwen_mcp_bridge.server import app


def make_pool_mock():
    pool = MagicMock()
    pool.list_openai_tools.return_value = [
        {"type": "function", "function": {"name": "locate__search_address",
         "description": "", "parameters": {"type": "object"}}}
    ]

    async def _dispatch(name, args):
        item = MagicMock()
        item.text = '{"items":[{"pnu":"1234"}]}'
        result = MagicMock()
        result.content = [item]
        result.isError = False
        return result

    pool.dispatch = AsyncMock(side_effect=_dispatch)
    pool.health.return_value = {
        "ready_domains": ["locate"],
        "failed_domains": {},
        "tool_count": 1,
    }

    pool.close = AsyncMock(return_value=None)
    pool.start = AsyncMock(return_value=None)
    return pool


@pytest.fixture
def client():
    """app.state.pool / app.state.settings를 직접 set + lifespan 무력화."""
    pool = make_pool_mock()
    from qwen_mcp_bridge.config import Settings

    @asynccontextmanager
    async def fake_lifespan(app):
        app.state.pool = pool
        app.state.settings = Settings(
            vllm_base_url="http://fake-vllm/v1",
            vllm_api_key="x",
            vllm_model="fake",
            urban_mcp_root="/tmp",
            bind_port=0,
            max_tool_iterations=3,
            vllm_timeout=30.0,
        )
        yield

    # FastAPI/Starlette: router.lifespan_context로 lifespan 보관
    app.router.lifespan_context = fake_lifespan
    with TestClient(app) as tc:
        yield tc, pool


def test_healthz(client):
    tc, _ = client
    resp = tc.get("/healthz")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert "locate" in resp.json()["ready_domains"]


def test_list_models(client):
    tc, _ = client
    resp = tc.get("/v1/models")
    assert resp.status_code == 200
    assert resp.json()["data"][0]["id"] == "fake"


@respx.mock
def test_chat_completions_passthrough_no_tool_call(client):
    tc, _ = client
    respx.post("http://fake-vllm/v1/chat/completions").mock(
        return_value=httpx.Response(200, json={
            "id": "x", "object": "chat.completion", "model": "fake",
            "choices": [{"index": 0, "finish_reason": "stop", "message": {
                "role": "assistant", "content": "안녕하세요"
            }}],
        })
    )
    resp = tc.post("/v1/chat/completions", json={
        "model": "fake",
        "messages": [{"role": "user", "content": "안녕"}],
    })
    assert resp.status_code == 200
    assert resp.json()["choices"][0]["message"]["content"] == "안녕하세요"


@respx.mock
def test_chat_completions_injects_query_routing_hint(client):
    tc, _ = client
    route = respx.post("http://fake-vllm/v1/chat/completions").mock(
        return_value=httpx.Response(200, json={
            "id": "x", "object": "chat.completion", "model": "fake",
            "choices": [{"index": 0, "finish_reason": "stop", "message": {
                "role": "assistant", "content": "확인했습니다"
            }}],
        })
    )

    resp = tc.post("/v1/chat/completions", json={
        "model": "fake",
        "messages": [{"role": "user", "content": "양재동 344-7번지 근처에 다세대주택 리스트"}],
    })

    assert resp.status_code == 200
    sent = route.calls.last.request.content
    assert b"anchor_type=address" in sent
    assert "anchor_text=양재동 344-7번지".encode() in sent
    assert b"locate__search_facility" in sent
    assert b"locate__search_address -> locate__get_parcel -> analyze__find_existing_buildings" in sent


def test_chat_completions_rejects_empty_messages(client):
    tc, _ = client
    resp = tc.post("/v1/chat/completions", json={"messages": []})
    assert resp.status_code == 400
