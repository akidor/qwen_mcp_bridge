# qwen_mcp_bridge

vLLM에 떠있는 Qwen3.6과 `urban_mcp` 8개 stdio MCP 서버를 잇는 OpenAI 호환 HTTP 브릿지.

## 설치
```
uv sync --extra dev
cp .env.example .env  # 필요 시 값 조정
```

## 실행
```
uv run uvicorn qwen_mcp_bridge.server:app --host 0.0.0.0 --port 8090
```

## 테스트
```
uv run pytest -q
```

## 사용
`qwen-chat-ui`의 vite proxy `/api/v1` target을 `http://localhost:8090/v1` 으로 바꿔 자연어 질의 → 자동 도구 호출 → 한국어 답변까지 한 흐름.

## 구성
- `src/qwen_mcp_bridge/server.py` — FastAPI `/v1/chat/completions`
- `src/qwen_mcp_bridge/mcp_pool.py` — 8 도메인 stdio 서버 spawn
- `src/qwen_mcp_bridge/chat_loop.py` — tool_call dispatch loop
- `src/qwen_mcp_bridge/tool_translation.py` — MCP ↔ OpenAI 변환
- `src/qwen_mcp_bridge/prompts.py` — system prompt
- `src/qwen_mcp_bridge/config.py` — env 로딩
