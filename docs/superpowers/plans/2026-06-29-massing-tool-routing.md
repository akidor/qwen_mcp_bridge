# 매스 생성 도구 라우팅 (generate_scene 우선) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) — 단일 파일 프롬프트 편집 + 라이브 검증이라 subagent 불필요.

**Goal:** 챗봇이 사용자 대면 매스/3D 생성 요청에 `design__generate_scene`(scene_data → 3D 카드 + C2 주입)을 호출하도록 시스템 프롬프트를 조정한다.

**Architecture:** `qwen_mcp_bridge/src/qwen_mcp_bridge/prompts.py`의 `_DOMAIN_GUIDE`와 item 15 매스 체인 안내 2곳만 수정. 프롬프트 텍스트 변경이라 단위테스트 불가 → 브릿지 재기동 후 라이브 질의로 검증.

**Tech Stack:** Python / FastAPI (qwen_mcp_bridge), 시스템 프롬프트(prompts.py).

## Global Constraints

- 범위 = 브릿지 프롬프트(prompts.py)만. urban_mcp/query_policy/C2 로직 변경 0.
- 체인 비파괴: shadow_analysis·cost_detail은 `{pnu,candidate,opts}` 직접 수신 → generate_volume 결과 불필요(검증으로 확인).
- 커밋: 한국어 Conventional Commits, claude/claude-code co-author 금지, `.env*` 금지, `git add -A` 금지(명시 경로만). 코드·주석 한국어. `git -c user.name='송민' -c user.email='imnimgnos@gmail.com' commit ...`.
- 브랜치: qwen_mcp_bridge `master`(레포 관례). push·부모 포인터는 라이브 검증 후 사용자 승인 시.

## File Structure

- `qwen_mcp_bridge/src/qwen_mcp_bridge/prompts.py` — (수정) 도메인 요약 line 14 + item 15 매스 체인 안내(line 74). 시스템 프롬프트 빌더.

---

### Task 1: 프롬프트에 generate_scene 우선 규칙 추가 + 라이브 검증

**Files:**
- Modify: `qwen_mcp_bridge/src/qwen_mcp_bridge/prompts.py:14`, `:74`

**Interfaces:** (없음 — 프롬프트 텍스트)

- [ ] **Step 1: 도메인 요약(line 14) 수정**

기존:
```
- design__: 매스·시나리오 (generate_volume, scenario_*, unit_layout, ...)
```
교체:
```
- design__: 매스·시나리오 (generate_scene[사용자 대면 매스/3D 기본], generate_volume[내부 부피], scenario_*, unit_layout, ...)
```

- [ ] **Step 2: 매스 도구 선택 규칙(line 74) 확장**

기존(line 74, item 15의 마지막 불릿):
```
    - 사용자가 후속으로 "이 부지 분석" 같이 단일 부지를 지목하면 `simulate.shadow_analysis` / `estimate.cost_detail` / `design.generate_scene` chain.
```
교체(기존 줄 유지 + 아래 3불릿 추가):
```
    - 사용자가 후속으로 "이 부지 분석" 같이 단일 부지를 지목하면 `simulate.shadow_analysis` / `estimate.cost_detail` / `design.generate_scene` chain.
    - **매스 생성·3D 표시 = `design__generate_scene`(기본)**: 사용자가 "매스/건물/N층/신축 건물"을 **생성**하거나 "3D/장면/입체로 보여줘"라고 하면 `design__generate_scene(pnu)`를 호출한다. scene_data로 3D 뷰어에 매스가 렌더되고 후보 카드가 자동 표시되며, 카드를 누르면 그 매스가 3D로 열린다.
    - `design__generate_volume`은 3D 표시가 불필요한 내부 부피 계산용으로만 쓴다(사용자가 매스를 보길 원하면 generate_scene).
    - 그림자·공사비·세대 후속은 generate 결과 없이 `{pnu, candidate, opts}`로 직접 호출할 수 있다(generate_volume 강제 아님).
```

- [ ] **Step 3: 브릿지 재기동 (새 프롬프트 적재)**

> 시스템 프롬프트는 요청마다 `build_system_prompt()`로 새로 빌드되지만, 실행 중 프로세스는 import된 모듈을 캐시하므로 **브릿지 재기동 필요**. `pkill -f` 금지(자가종료) → `./stop.sh && ./run.sh`(pgid-safe).

```bash
cd /home/nimgnos/poit-ai && ./stop.sh >/dev/null 2>&1 && ./run.sh >/dev/null 2>&1 && sleep 4 && curl -sS -m 5 http://localhost:8090/healthz >/dev/null && echo "bridge 재기동 OK"
```

- [ ] **Step 4: 라이브 검증 — 매스 요청이 generate_scene을 호출**

```bash
curl -sS -m 200 -N http://localhost:8090/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"stream":true,"messages":[{"role":"user","content":"강남구 역삼동 738-1 필지에 다세대 매스 만들어서 3D로 보여줘"}]}' 2>/dev/null \
  | grep -oE '"name": ?"design__[a-z_]+"' | sort -u
```
Expected: `design__generate_scene` 포함, `design__generate_volume` 미포함(또는 scene이 주). 만약 여전히 generate_volume이면 §비범위의 description 레버로 escalate.

- [ ] **Step 5: 체인 비파괴 확인 — 그림자 질의는 여전히 동작**

```bash
curl -sS -m 200 -N http://localhost:8090/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"stream":true,"messages":[{"role":"user","content":"강남구 역삼동 738-1 이 부지 그림자 분석해줘"}]}' 2>/dev/null \
  | grep -oE '"name": ?"(design__[a-z_]+|simulate__[a-z_]+)"' | sort -u
```
Expected: `simulate__shadow_analysis` 호출(그림자 체인 정상). generate_scene/volume 어느 쪽이든 그림자 분석이 수행되면 OK.

- [ ] **Step 6: 커밋**

```bash
cd /home/nimgnos/poit-ai/qwen_mcp_bridge
git add src/qwen_mcp_bridge/prompts.py
git -c user.name='송민' -c user.email='imnimgnos@gmail.com' commit -m "feat(prompts): 사용자 대면 매스/3D 요청을 generate_scene으로 라우팅 (3D 카드·주입 트리거)"
```

- [ ] **Step 7: push + 부모 포인터 (사용자 승인 시)**

```bash
cd /home/nimgnos/poit-ai/qwen_mcp_bridge && git push
cd /home/nimgnos/poit-ai && git add qwen_mcp_bridge && git -c user.name='송민' -c user.email='imnimgnos@gmail.com' commit -m "chore: 매스 도구 라우팅 프롬프트 서브모듈 포인터 갱신" && git push
```

---

## Self-Review

**1. Spec coverage:** §4.1 도메인 요약 → Step 1 ✓. §4.2 매스 규칙 → Step 2 ✓. §5 라이브 검증(매스→scene, 그림자 체인 비파괴) → Step 4·5 ✓. §3 안전성 → Step 5로 실증 ✓.

**2. Placeholder scan:** 모든 step에 실제 텍스트·명령·기대결과. TBD/TODO 없음. (단위테스트 부재는 의도적 — 프롬프트 변경, §5에 명시.)

**3. Type consistency:** 코드 타입 없음(프롬프트 텍스트). 도구명 `design__generate_scene`/`design__generate_volume`/`simulate__shadow_analysis` 일관.
