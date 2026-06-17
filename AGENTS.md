# Repository Agent Guide

이 문서는 `qwen_mcp_bridge`에서 작업하는 에이전트가 지켜야 하는 기본 운영 규칙입니다. 작업을 시작하기 전에 이 파일을 먼저 읽고, 하위 디렉터리에 별도 `AGENTS.md`가 있으면 더 가까운 파일의 지침을 우선합니다.

## 프로젝트 구조

- `src/qwen_mcp_bridge/`: FastAPI 기반 OpenAI 호환 Qwen/MCP 브릿지
- `tests/`: Python backend 테스트
- `web/`: Vite + React + MapLibre + Three.js 프론트엔드
- `web/src/architecture/`: 3D 시스템 구조도, 연결성 분석, 권장 링크 미리보기
- `.env.example`: 환경 변수 예시
- `.env`: 로컬 비밀값 및 실행 환경. 직접 수정 금지

## 절대 금지

- `.env`, `.env.*`, 인증키, 토큰, 로컬 비밀값 파일을 수정하거나 커밋하지 않는다.
- 환경 변수 변경이 필요하면 `.env.example` 또는 문서만 수정하고, 실제 `.env` 변경은 사용자에게 요청한다.
- 사용자가 만든 변경을 임의로 되돌리지 않는다.
- `git reset --hard`, `git checkout -- <file>`, 강제 push 같은 파괴적 명령은 사용자가 명시적으로 지시한 경우에만 실행한다.
- 실행 중인 dev server, bridge, MCP 프로세스를 임의로 죽이거나 재시작하지 않는다. 포트 충돌이나 재시작이 필요하면 먼저 현재 PID/포트를 확인하고 이유를 설명한다.
- 비밀값, 로컬 경로의 민감 정보, API 키를 로그나 최종 응답에 노출하지 않는다.

## 작업 방식

- 변경 전 `git status --short`로 워크트리 상태를 확인한다.
- 텍스트/파일 검색은 우선 `rg` 또는 `rg --files`를 사용한다.
- 파일 수정은 가능한 `apply_patch`로 수행한다.
- 기존 코드 스타일과 구조를 우선한다. 불필요한 리팩터링을 섞지 않는다.
- 새 기능, MCP 서버/도구, 라우팅 흐름, 데이터 파이프라인, 렌더링 경로, 분석 도메인처럼 시스템 구조에 영향을 주는 변경을 추가하면 `web/src/architecture/`의 3D 구조도 반영 여부를 함께 검토한다.
- 구조도 반영이 필요한 변경이면 `architectureData.ts`, 관련 테스트, 필요 시 연결성 분석/표시 UI까지 같은 작업 범위에 포함한다. 반영하지 않는다면 완료 보고에 이유를 적는다.
- 새 기능을 한 파일에 계속 덧붙여 파일이 과도하게 길어지게 하지 않는다.
- 컴포넌트, hook, 순수 유틸, 데이터 정의를 적절히 분리해 유지보수 가능한 단위로 만든다.
- 파일이 이미 크다면 같은 파일에 기능을 추가하기 전에 분리 가능한 책임을 먼저 확인한다.
- 새 추상화는 실제 중복이나 복잡도를 줄일 때만 추가한다. 이름만 멋진 얇은 wrapper는 만들지 않는다.
- 프론트엔드 UI/3D 변경은 데스크톱과 모바일 모두에서 실제 화면을 확인한다.
- 3D/canvas 작업은 Playwright screenshot과 pixel nonblank 확인을 함께 수행한다.
- 기존 dev server가 떠 있으면 재사용한다. 새로 띄워야 하면 포트 충돌을 확인한다.

## 코드 구조와 유지보수성

- 한 컴포넌트가 렌더링, 상태 관리, 데이터 계산, 이벤트 처리, 스타일 판단을 모두 떠안지 않게 한다.
- React 화면은 가능한 단위 컴포넌트로 나눈다.
  - 예: `Scene`, `Panel`, `List`, `Toolbar`, `Card`, `FlowStrip`
- 비즈니스 규칙이나 분석 로직은 React 컴포넌트 바깥의 순수 함수로 둔다.
- 테스트 가능한 로직은 UI 파일에 묻지 말고 별도 모듈로 분리한다.
- 큰 파일을 수정할 때는 “이번 변경으로 더 커지는 것이 맞는가”를 먼저 판단한다.
- 불필요한 대규모 리팩터링은 피하되, 새 기능 때문에 자연스럽게 커지는 부분은 작은 모듈로 나누는 것을 우선한다.
- 완료 보고에는 유지보수성을 위해 분리한 파일/컴포넌트가 있으면 함께 설명한다.

## 주요 명령

Backend:

```bash
uv sync --extra dev
uv run pytest -q
uv run uvicorn qwen_mcp_bridge.server:app --host 0.0.0.0 --port 8090
```

Frontend:

```bash
cd web
npm run dev
npm run test
npm run build
```

Frontend 기본 포트:

- Vite dev: `7474`
- Vite preview: `4174`

## 검증 기준

- Python backend 변경: `uv run pytest -q`
- Frontend 변경: `cd web && npm run test`
- Frontend 타입/번들 변경: `cd web && npm run build`
- 3D 구조도/지도 UI 변경:
  - Playwright로 해당 화면 진입 확인
  - 콘솔/page error 확인
  - screenshot 저장
  - canvas 또는 지도 영역 pixel nonblank 확인
- 문서만 변경한 경우 테스트 실행이 필요 없을 수 있다. 이 경우 최종 보고에 “문서 변경이라 테스트는 실행하지 않음”이라고 명시한다.

## Git 규칙

- 커밋 전 `git diff --check`를 실행한다.
- 커밋 메시지는 Conventional Commit 형식을 사용한다.
  - 예: `feat: add architecture connectivity analysis`
  - 예: `docs: add agent operating guide`
- 사용자가 푸시를 기대하는 흐름이면 커밋 후 `git push origin master`까지 수행한다.
- 커밋/푸시 후 `git status --short`로 clean 여부를 확인한다.

## 완료 보고 형식

작업 완료 후 최종 응답에는 아래 내용을 포함한다.

1. 작업한 내용
   - 어떤 파일을 만들거나 수정했는지
   - 핵심 동작이 어떻게 바뀌었는지

2. 검증한 내용
   - 실행한 테스트/빌드/브라우저 확인 명령
   - 실행하지 못한 검증이 있으면 이유

3. 사용자가 직접 확인해볼 것
   - 접속 URL, 버튼, 시나리오, 예시 질의 등
   - UI 작업이면 데스크톱/모바일에서 확인할 포인트

4. 다음 작업 제안
   - 현재 변경 다음에 이어서 하면 좋은 작업 1~3개
   - 추천 1순위를 분명히 표시

5. 커밋/푸시 상태
   - 커밋 해시와 메시지
   - 원격 반영 여부
   - 워크트리 clean 여부

## 완료 보고 예시

```text
작업 내용:
- `web/src/architecture/architectureGraph.ts`에 연결성 분석을 추가했습니다.
- 3D 구조도에 취약 노드 링과 권장 링크 미리보기를 표시했습니다.

검증:
- `cd web && npm run test` 통과
- `cd web && npm run build` 통과
- Playwright로 데스크톱/모바일 구조도 진입과 canvas nonblank 확인

직접 확인:
- `http://localhost:7474` 접속 후 `3D 구조` 버튼
- `권장 링크 미리보기` 토글 on/off
- `design -> polygon`, `map -> web` 권장 링크 표시

다음 작업 제안:
- 추천 1순위: 권장 링크를 “적용 예정/무시” 상태로 관리하는 검토 워크플로우 추가

커밋:
- `abc1234 feat: preview suggested architecture links`
- `origin/master` 푸시 완료
- 워크트리 clean
```
