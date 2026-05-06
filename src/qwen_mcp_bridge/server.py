"""FastAPI app — OpenAI 호환 /v1/chat/completions."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from qwen_mcp_bridge.config import get_settings
from qwen_mcp_bridge.mcp_pool import McpPool
from qwen_mcp_bridge.chat_loop import run_chat, MaxIterReached
from qwen_mcp_bridge.chat_loop_streaming import run_chat_streaming
from qwen_mcp_bridge.prompts import build_system_prompt


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    pool = McpPool(urban_mcp_root=settings.urban_mcp_root)
    await pool.start()
    app.state.pool = pool
    app.state.settings = settings
    logger.info("MCP pool 시작 — health=%s", pool.health())
    try:
        yield
    finally:
        await pool.close()


app = FastAPI(title="qwen_mcp_bridge", version="0.1.0", lifespan=lifespan)


@app.get("/healthz")
async def healthz(request: Request) -> dict:
    pool: McpPool = request.app.state.pool
    return {"status": "ok", **pool.health()}


@app.get("/v1/models")
async def list_models(request: Request) -> dict:
    settings = request.app.state.settings
    return {
        "object": "list",
        "data": [{
            "id": settings.vllm_model,
            "object": "model",
            "owned_by": "qwen_mcp_bridge",
        }],
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: Request) -> Any:
    body = await request.json()
    settings = request.app.state.settings
    pool: McpPool = request.app.state.pool

    user_messages = body.get("messages") or []
    if not isinstance(user_messages, list) or not user_messages:
        raise HTTPException(status_code=400, detail="messages가 비어있습니다")

    # system prompt를 우리 브릿지가 추가. 클라이언트가 보낸 system 메시지가 있으면
    # 두 개를 하나로 병합 — Qwen3.6 chat template는 system이 정확히 1개 (그것도 맨 앞)여야 함.
    bridge_system_content = build_system_prompt()
    if user_messages and user_messages[0].get("role") == "system":
        client_system_content = user_messages[0].get("content") or ""
        rest = user_messages[1:]
        combined = bridge_system_content + "\n\n" + client_system_content if client_system_content else bridge_system_content
        merged_messages = [{"role": "system", "content": combined}, *rest]
    else:
        merged_messages = [{"role": "system", "content": bridge_system_content}, *user_messages]

    # stream=true면 SSE 스트리밍 응답
    if body.get("stream") is True:
        gen = run_chat_streaming(
            messages=merged_messages,
            pool=pool,
            vllm_base_url=settings.vllm_base_url,
            vllm_api_key=settings.vllm_api_key,
            model=body.get("model") or settings.vllm_model,
            max_iterations=settings.max_tool_iterations,
            request_timeout=settings.vllm_timeout,
        )
        return StreamingResponse(
            gen,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    try:
        result = await run_chat(
            messages=merged_messages,
            pool=pool,
            vllm_base_url=settings.vllm_base_url,
            vllm_api_key=settings.vllm_api_key,
            model=body.get("model") or settings.vllm_model,
            max_iterations=settings.max_tool_iterations,
            request_timeout=settings.vllm_timeout,
        )
    except MaxIterReached as e:
        # 친근한 한국어로 마감
        return JSONResponse(
            status_code=200,
            content={
                "id": "bridge-maxiter",
                "object": "chat.completion",
                "model": settings.vllm_model,
                "choices": [{
                    "index": 0,
                    "finish_reason": "stop",
                    "message": {
                        "role": "assistant",
                        "content": (
                            f"도구를 {settings.max_tool_iterations}번 호출했지만 "
                            "최종 답변을 만들지 못했습니다. 질문을 더 구체적으로 다시 시도해 주세요."
                        ),
                    },
                }],
            },
        )

    return result
