# qwen_mcp_bridge

vLLM에서 구동 중인 Qwen과 `urban_mcp` 8개 stdio MCP 서버를 잇는 OpenAI 호환 HTTP 브릿지(FastAPI :8090) + 채팅 UI(Vite+React :7474).

전체 파이프라인에서의 위치: [상위 ARCHITECTURE](../ARCHITECTURE.md)

---

## 빠른 시작

### 1. 백엔드 설치 및 실행

```bash
# 의존성 설치 (개발 도구 포함)
uv sync --extra dev

# .env 준비 (아직 없으면)
cp .env.example .env
# .env 직접 수정 금지 — 변경이 필요하면 사용자에게 요청 (AGENTS.md 참조)

# 브릿지 서버 기동
uv run uvicorn qwen_mcp_bridge.server:app --host 0.0.0.0 --port 8090
```

기동 후 헬스체크로 도메인 연결 확인:

```bash
curl localhost:8090/healthz
# "ready_domains" 8개, "failed_domains" {} 확인
```

### 2. 채팅 UI 기동

```bash
cd web
npm ci
npm run dev
# http://localhost:7474 에서 접속
```

### 전체 파이프라인 기동 순서

1. vLLM(:8016), polygon 백엔드(:7469) 기동
2. urban_mcp: `uv sync --all-packages` (별도 레포)
3. 브릿지: `uv sync --extra dev` → `uv run uvicorn qwen_mcp_bridge.server:app --host 0.0.0.0 --port 8090`
4. `curl localhost:8090/healthz` → `ready_domains` 8개 / `failed_domains` {} 확인
5. 채팅 UI: `cd web && npm ci && npm run dev` (:7474)

---

## 구성

| 파일 | 책임 |
|---|---|
| `src/qwen_mcp_bridge/server.py` | FastAPI 앱, `/healthz`·`/v1/models`·`/v1/chat/completions` |
| `src/qwen_mcp_bridge/mcp_pool.py` | 8도메인 stdio spawn, tool dispatch |
| `src/qwen_mcp_bridge/chat_loop.py` | tool_call 디스패치 루프 |
| `src/qwen_mcp_bridge/tool_translation.py` | MCP ↔ OpenAI 도구 형식 변환 |
| `src/qwen_mcp_bridge/prompts.py` | system prompt |
| `src/qwen_mcp_bridge/config.py` | 환경변수 로딩 |
| `src/qwen_mcp_bridge/ui_tools.py` | in-process UI 도구 |
| `web/` | Vite+React 채팅 UI, `/api`→:8090 프록시 |

내부 디스패치 루프·spawn 구조 상세: [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 환경변수

`.env.example`을 복사해 `.env`를 만든다. **`.env`는 절대 직접 수정하지 않는다** (AGENTS.md 참조). 변경이 필요하면 사용자에게 요청한다.

| 변수명 | 용도 | 예시 (placeholder) |
|---|---|---|
| `VLLM_BASE_URL` | vLLM OpenAI 호환 엔드포인트 | `http://localhost:8016/v1` |
| `VLLM_API_KEY` | vLLM API 키 (불필요 시 임의 값) | `unused` |
| `VLLM_MODEL` | vLLM 실제 서빙 모델 ID (정확히 일치해야 함) | `<model-id>` |
| `URBAN_MCP_ROOT` | urban_mcp 레포 절대경로 (spawn 작업 디렉토리) | `/path/to/urban_mcp` |
| `BIND_HOST` | 브릿지 HTTP 바인드 주소 | `0.0.0.0` |
| `BIND_PORT` | 브릿지 HTTP 포트 | `8090` |
| `MAX_TOOL_ITERATIONS` | tool_call 디스패치 루프 최대 반복 횟수 | `5` |
| `VLLM_TIMEOUT` | vLLM 요청 타임아웃 (초) | `120` |
| `MCP_TOOL_TIMEOUT` | MCP 도구 호출 타임아웃 (초) | `60` |

web 지도 타일 설정은 `web/.env.local`의 `VITE_VWORLD_API_KEY`를 별도로 설정한다 (없으면 basemap 타일 404).

---

## 개발 가이드

### 테스트

```bash
# 백엔드
uv run pytest -q

# 프론트엔드
cd web && npm run test

# 타입/번들 확인
cd web && npm run build
```

### 커밋 규칙

Conventional Commits 형식을 사용한다. 자세한 운영 규칙은 [AGENTS.md](./AGENTS.md) 참조.

```
feat: 새 기능
fix: 버그 수정
docs: 문서 변경
refactor: 리팩터링 (동작 변경 없음)
test: 테스트 추가/수정
```

### 주의 사항

- `.env` 직접 수정 금지: 환경변수 변경이 필요하면 `.env.example` 또는 문서만 수정하고 실제 `.env` 변경은 사용자에게 요청한다.
- `VLLM_MODEL`은 vLLM이 실제 서빙하는 모델 ID와 정확히 일치해야 한다(불일치 시 요청 거부).
- `URBAN_MCP_ROOT`가 실제 urban_mcp 경로여야 spawn에 성공한다.
- urban_mcp가 `uv sync --all-packages`로 설치되어 있지 않으면 도메인 spawn이 전부 실패한다.
- production 정적 서빙 미구현: 현재 `server.py`에 `web/dist` mount 없음 → 반드시 `npm run dev`(:7474) 프록시로 사용한다.

---

## 아키텍처 상세

내부 모듈 구조, tool_call 디스패치 루프, 도메인 spawn 구조, 함정·제약 전체 목록:

[ARCHITECTURE.md](./ARCHITECTURE.md)
