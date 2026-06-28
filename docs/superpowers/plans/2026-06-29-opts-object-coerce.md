# 툴 인자 object coercion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) — 단일 함수 1분기 + 단위테스트 + 라이브 검증.

**Goal:** `_coerce_args`에 object 분기를 추가해 Qwen이 문자열화한 `opts`(및 모든 object 타입 인자)를 dict로 복원, 매스 생성 검증 실패를 해소한다.

**Architecture:** `mcp_pool._coerce_args`(이미 integer/number/boolean/array 복원)에 object 분기 1개 추가. 순수 함수라 단위테스트 + 라이브 검증.

**Tech Stack:** Python / pytest (qwen_mcp_bridge).

## Global Constraints

- 범위 = `mcp_pool._coerce_args` 1분기. 예산/.env/프롬프트/urban_mcp 변경 0.
- schema-gated: object 타입 파라미터에만 적용(오탐 0). 변환 실패 시 원본 유지(기존 array/int 분기와 일관).
- 기존 coercion(integer/number/boolean/array) 동작 회귀 0.
- 커밋: 한국어 Conventional Commits, claude/claude-code co-author 금지, `.env*` 금지, `git add -A` 금지. `git -c user.name='송민' -c user.email='imnimgnos@gmail.com' commit ...`.
- 브랜치: qwen_mcp_bridge `master`. push·부모 포인터는 라이브 검증 후 사용자 승인 시(직전 프롬프트 라우팅 커밋 65b9fbc와 함께 publish).

## File Structure

- `qwen_mcp_bridge/src/qwen_mcp_bridge/mcp_pool.py` — (수정) `_coerce_args`에 object 분기.
- `qwen_mcp_bridge/tests/test_mcp_pool.py` — (수정) object 분기 단위테스트.

---

### Task 1: _coerce_args object 분기 + 테스트 + 라이브 검증

**Files:**
- Modify: `qwen_mcp_bridge/src/qwen_mcp_bridge/mcp_pool.py:45-49` (array 분기 뒤)
- Test: `qwen_mcp_bridge/tests/test_mcp_pool.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/test_mcp_pool.py` 끝에 추가:
```python
def test_coerce_args_parses_json_object_string_for_object_schema():
    schema = {"properties": {"opts": {"type": ["object", "null"]}}}
    coerced = _coerce_args(
        {"pnu": "1168010100107380001", "opts": '{"height_max": 12, "far_max": 250, "use_category": "공동주택"}'},
        schema,
    )
    assert coerced["opts"] == {"height_max": 12, "far_max": 250, "use_category": "공동주택"}
    assert coerced["pnu"] == "1168010100107380001"  # string 파라미터 불변


def test_coerce_args_object_keeps_non_json_string():
    schema = {"properties": {"opts": {"type": ["object", "null"]}}}
    coerced = _coerce_args({"opts": "그냥 텍스트"}, schema)
    assert coerced["opts"] == "그냥 텍스트"  # 파싱 불가 → 원본 유지


def test_coerce_args_object_ignores_json_array_for_object_type():
    # object 타입인데 배열 문자열이 오면 dict 아니므로 원본 유지
    schema = {"properties": {"opts": {"type": "object"}}}
    coerced = _coerce_args({"opts": "[1,2,3]"}, schema)
    assert coerced["opts"] == "[1,2,3]"
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/nimgnos/poit-ai/qwen_mcp_bridge && uv run pytest tests/test_mcp_pool.py -q -k coerce_args_parses_json_object`
Expected: FAIL — `opts`가 문자열 그대로(분기 없음).

- [ ] **Step 3: 구현** — `mcp_pool.py`의 `_coerce_args`에서 array 분기(line 45-49) 직후에 추가:

기존:
```python
        if "array" in allowed:
            coerced_array = _coerce_array_string(value, prop_def)
            if coerced_array is not None:
                out[key] = coerced_array
                continue
```
바로 뒤에 삽입:
```python
        if "object" in allowed:
            stripped = value.strip()
            if stripped.startswith("{"):
                try:
                    parsed = json.loads(stripped)
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, dict):
                    out[key] = parsed
                    continue
```
(`json`은 mcp_pool.py 상단에 이미 import됨 — line 77 `json.loads` 사용 확인.)

- [ ] **Step 4: 통과 + 회귀**

Run: `cd /home/nimgnos/poit-ai/qwen_mcp_bridge && uv run pytest tests/test_mcp_pool.py -q`
Expected: PASS (기존 array/int/bool 포함 + 신규 3). (`test_pool_lifecycle_with_locate_domain_only`는 사전존재 환경 실패 — 무관, 격리 spawn 문제.)

- [ ] **Step 5: 커밋**

```bash
cd /home/nimgnos/poit-ai/qwen_mcp_bridge
git add src/qwen_mcp_bridge/mcp_pool.py tests/test_mcp_pool.py
git -c user.name='송민' -c user.email='imnimgnos@gmail.com' commit -m "fix(mcp): _coerce_args에 object 분기 추가 — Qwen stringified-opts를 dict로 복원"
```

- [ ] **Step 6: 라이브 검증 (브릿지 재기동 후)**

```bash
cd /home/nimgnos/poit-ai && ./stop.sh >/dev/null 2>&1 && ./run.sh >/dev/null 2>&1 && sleep 4
curl -sS -m 220 -N http://localhost:8090/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"stream":true,"messages":[{"role":"user","content":"강남구 역삼동 738-1 필지에 다세대 매스 만들어서 3D로 보여줘"}]}' 2>/dev/null \
  | python3 -c "import sys,json;[print(e.get('name'),e.get('result_size'),('ERR' if 'validation error' in (e.get('result_text') or '') else 'ok')) for l in sys.stdin if l.startswith('data:') and l[5:].strip() not in ('[DONE]','') for e in [json.loads(l[5:])] if e.get('type')=='tool_call_end']"
```
Expected: `design__generate_scene` result_size 대형 + `ok`(validation error 없음). scene_data 반환 → 카드·주입 가능.

- [ ] **Step 7: push + 부모 포인터 (사용자 승인 시 — 프롬프트 라우팅 65b9fbc 포함 일괄)**

```bash
cd /home/nimgnos/poit-ai/qwen_mcp_bridge && git push
cd /home/nimgnos/poit-ai && git add qwen_mcp_bridge && git -c user.name='송민' -c user.email='imnimgnos@gmail.com' commit -m "chore: 챗봇 매스 라우팅+opts coercion 서브모듈 포인터 갱신" && git push
```

---

## Self-Review

**1. Spec coverage:** §3 object 분기 → Step 3 ✓. §5 단위테스트(복원/원본유지/배열무시) → Step 1 ✓. §5 라이브 → Step 6 ✓. §4 회귀 0 → Step 4 ✓.
**2. Placeholder scan:** 실제 코드·명령·기대결과. TBD 없음.
**3. Type consistency:** `_coerce_args(args, schema)` 시그니처 불변, object 분기는 기존 array 분기와 동형(`json.loads`+isinstance 가드).
