# urban-chat

`qwen_mcp_bridge`의 React/Vite 프론트엔드. 자연어 질의 → urban_mcp 도구 자동 호출 → 한국어 답변.

## 구성

- Vite + React + TypeScript
- Dev proxy `/api/*` → `http://127.0.0.1:8090/*` (qwen_mcp_bridge)
- 모델 목록 로딩
- assistant/user 타임라인
- No-think 토글 (`chat_template_kwargs.enable_thinking=false`)
- Raw JSON + 토큰 메트릭 패널

## Dev

```bash
cd web
npm install
npm run dev    # http://localhost:4173
```

브릿지(`uvicorn qwen_mcp_bridge.server:app --port 8090`)가 별도로 떠있어야 함.

## Build (production)

```bash
npm run build  # → web/dist
```

배포 시엔 bridge의 FastAPI가 `web/dist`를 정적으로 서빙 (server.py 측 mount).

## Proxy

- `/api/v1/models` → `http://127.0.0.1:8090/v1/models`
- `/api/v1/chat/completions` → `http://127.0.0.1:8090/v1/chat/completions`
