# 챗봇 건물통계 차트 라우팅 안정화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 특정 필지(타이핑-주소·지도-클릭)에 대한 "건물통계 차트" 요청이 결정적으로 `existing_building_statistics` 도구로 라우팅되게 한다.

**Architecture:** 근본원인은 STATS 의도가 NEARBY(주변/근처) 단어에 종속돼 있다는 것. `query_policy.build_routing_hint`(실제 모델 조종)와 `intent.classify_intent`(관측 라벨)에서 STATS를 강/약 두 세트로 나눠 — 강한 통계명사는 DETAIL보다, 약한 단어는 DISPLAY보다 우선 — NEARBY 없이도 통계로 보낸다. 지도-클릭 흐름은 `current_parcel` 컨텍스트 + STATS면 deictic 없이 통계로. poit은 `centroid`를 메타데이터에 실어 통계 체인을 1콜로 단축.

**Tech Stack:** Python 3.11 / FastAPI / pytest (qwen_mcp_bridge), Next.js 13 / TypeScript / vitest (poit).

## Global Constraints

- 정책3 확정: 강(strong) 통계명사는 DETAIL보다 우선, 약(soft) 단어는 DETAIL 뒤·DISPLAY보다 우선.
- v1 범위 = `existing_building_statistics`(건물통계)만. 용도지역/그림자/주차 라우팅·RISK/DETAIL 게이팅·도구예산은 비범위.
- `_STATS_RE`는 강∪약 **합집합으로 유지** — 기존 NEARBY 내부 분기 등 모든 기존 참조의 동작을 100% 보존.
- 커밋: 한국어 Conventional Commits, claude co-author 금지, `.env*` 금지. 모든 커밋은 `git -c user.name='송민' -c user.email='imnimgnos@gmail.com' commit ...`로 작성.
- 서브모듈 규율: push·부모 포인터 갱신은 **모든 코드 완료 후** 한 번에(자식 먼저). 각 task는 자식 레포 안에서만 커밋.
- 검증: qwen_mcp_bridge `uv run pytest -q`, poit `npm run test:ci` + `npx tsc --noEmit` 최종 그린.

## File Structure

- `qwen_mcp_bridge/src/qwen_mcp_bridge/query_policy.py` — STATS 강/약 regex(§Task1), 주소 분기 precedence(§Task2), current_parcel 분기(§Task3). 핵심.
- `qwen_mcp_bridge/src/qwen_mcp_bridge/intent.py` — 라벨 동기화(§Task4). query_policy의 regex를 import.
- `qwen_mcp_bridge/tests/test_query_policy.py` — Task1~3 단위 테스트.
- `qwen_mcp_bridge/tests/test_intent.py` — Task4 라벨 테스트.
- `qwen_mcp_bridge/tests/test_routing_debug.py` + `tests/scenario/fixtures/routing_debug_cases.json` — Task4 통합/픽스처.
- `poit/lib/chat/parcelMetadata.ts` — 신규 순수 함수(§Task5).
- `poit/components/workspace/chat/ChatPanel.tsx` — 위 함수로 교체(§Task5).
- `poit/tests/lib/chat/parcelMetadata.test.ts` — Task5 단위 테스트.

---

### Task 1: STATS 강/약 regex 분리

**Files:**
- Modify: `qwen_mcp_bridge/src/qwen_mcp_bridge/query_policy.py:37-46`
- Test: `qwen_mcp_bridge/tests/test_query_policy.py`

**Interfaces:**
- Produces: `_STATS_STRONG_RE`, `_STATS_SOFT_RE`, `_STATS_RE`(=강∪약) — 모듈 레벨 `re.Pattern`. Task2~4가 import/사용.

- [ ] **Step 1: 실패 테스트 작성**

`tests/test_query_policy.py` 맨 끝에 추가:

```python
def test_stats_strong_soft_partition_preserves_union():
    from qwen_mcp_bridge.query_policy import _STATS_STRONG_RE, _STATS_SOFT_RE, _STATS_RE

    # 강: 명백한 수량·분포 명사
    for w in ["통계", "통계치", "분포", "밀도", "집계", "개수", "카운트", "수량",
              "몇 개", "몇 곳", "몇 동", "몇 필지", "총 몇", "총량", "비율", "비중",
              "평균", "중앙값", "합계"]:
        assert _STATS_STRONG_RE.search(w), f"strong이 매칭해야: {w}"
        assert not _STATS_SOFT_RE.search(w), f"soft가 매칭하면 안됨: {w}"

    # 약: 검토/요약 맥락에도 섞이는 단어
    for w in ["현황", "요약", "구성", "얼마나 있어"]:
        assert _STATS_SOFT_RE.search(w), f"soft가 매칭해야: {w}"
        assert not _STATS_STRONG_RE.search(w), f"strong이 매칭하면 안됨: {w}"

    # 합집합은 기존 _STATS_RE 키워드 전부 보존
    for w in ["통계치", "통계", "분포", "현황", "몇 개", "몇 곳", "몇 동", "몇 필지",
              "개수", "비율", "비중", "집계", "요약", "평균", "중앙값", "합계",
              "총 몇", "총량", "수량", "카운트", "얼마나 있어", "밀도", "구성"]:
        assert _STATS_RE.search(w), f"union이 매칭해야: {w}"
```

- [ ] **Step 2: 실패 확인**

Run: `cd qwen_mcp_bridge && uv run pytest tests/test_query_policy.py::test_stats_strong_soft_partition_preserves_union -v`
Expected: FAIL — `ImportError: cannot import name '_STATS_STRONG_RE'`

- [ ] **Step 3: 구현**

`query_policy.py:37-46`의 기존 블록:

```python
# 통계/분포/현황 의도 — existing_building_stats 분기 트리거.
_STATS_RE = re.compile(
    r"통계치|통계|분포|현황|"
    r"몇\s*개|몇\s*곳|몇\s*동|몇\s*필지|개수|"
    r"비율|비중|"
    r"집계|요약|"
    r"평균|중앙값|합계|총\s*몇|총량|수량|카운트|"
    r"얼마나(?:\s*있|야|인가|인지)?|"
    r"밀도|구성"
)
```

를 다음으로 교체:

```python
# 통계/분포/현황 의도 — existing_building_stats 분기 트리거.
# 강(strong): 명백한 수량·분포 명사 — 검토/요약 맥락에 거의 안 섞임 → DETAIL보다 우선.
_STATS_STRONG_RE = re.compile(
    r"통계치|통계|분포|밀도|집계|"
    r"개수|카운트|수량|몇\s*개|몇\s*곳|몇\s*동|몇\s*필지|총\s*몇|총량|"
    r"비율|비중|평균|중앙값|합계"
)
# 약(soft): 검토/요약 맥락에도 섞이는 단어 → DETAIL 뒤·DISPLAY보다 우선.
_STATS_SOFT_RE = re.compile(
    r"현황|요약|구성|얼마나(?:\s*있|야|인가|인지)?"
)
# 합집합 — 기존 동작 보존(NEARBY 내부 분기 등 기존 _STATS_RE 참조 전부 그대로).
_STATS_RE = re.compile(f"(?:{_STATS_STRONG_RE.pattern})|(?:{_STATS_SOFT_RE.pattern})")
```

- [ ] **Step 4: 통과 확인 + 전체 회귀**

Run: `cd qwen_mcp_bridge && uv run pytest tests/test_query_policy.py tests/test_intent.py tests/test_routing_debug.py -q`
Expected: PASS (신규 1 + 기존 전부 — 합집합 유지로 회귀 0)

- [ ] **Step 5: 커밋**

```bash
cd qwen_mcp_bridge
git add src/qwen_mcp_bridge/query_policy.py tests/test_query_policy.py
git -c user.name='송민' -c user.email='imnimgnos@gmail.com' commit -m "refactor(routing): _STATS_RE를 강/약 세트로 분리 (합집합 보존)"
```

---

### Task 2: 주소 분기 strong/soft STATS precedence

**Files:**
- Modify: `qwen_mcp_bridge/src/qwen_mcp_bridge/query_policy.py:78-89` (`build_routing_hint` 주소 블록)
- Test: `qwen_mcp_bridge/tests/test_query_policy.py`

**Interfaces:**
- Consumes: `_STATS_STRONG_RE`, `_STATS_RE`(Task1), 기존 `_existing_stats_hint(text, anchor_type, anchor_text, radius)`(이미 존재, line 394).

- [ ] **Step 1: 실패 테스트 작성**

`tests/test_query_policy.py` 끝에 추가:

```python
def test_routing_hint_direct_address_stats_chart_routes_to_statistics():
    """'역삼동 123-45 건물통계 차트 보여줘' (주변 없음) → 통계 도구."""
    hint = build_routing_hint([
        {"role": "user", "content": "강남구 역삼동 123-45 건물통계 차트 보여줘"},
    ])
    assert hint is not None
    assert "bucket=기존 건축물 통계 조회" in hint
    assert "analyze__existing_building_statistics" in hint
    assert "여기 뭐야" not in hint  # _address_display_hint로 새지 않음


def test_routing_hint_direct_address_strong_stats_beats_detail():
    """'건물통계 분석해줘' → strong STATS가 DETAIL(분석)보다 우선."""
    hint = build_routing_hint([
        {"role": "user", "content": "역삼동 123-45 건물통계 분석해줘"},
    ])
    assert hint is not None
    assert "bucket=기존 건축물 통계 조회" in hint
    assert "analyze__existing_building_statistics" in hint


def test_routing_hint_soft_summary_stays_parcel_detail():
    """'분석 요약' → soft(요약)이 DETAIL을 가로채지 않음 → 상세 검토 유지."""
    hint = build_routing_hint([
        {"role": "user", "content": "역삼동 123-45 분석 요약해줘"},
    ])
    assert hint is not None
    assert "bucket=단일 필지 상세 검토" in hint
    assert "기존 건축물 통계 조회" not in hint
```

- [ ] **Step 2: 실패 확인**

Run: `cd qwen_mcp_bridge && uv run pytest tests/test_query_policy.py -v -k "direct_address_stats_chart or strong_stats_beats_detail"`
Expected: FAIL — 현재는 `_address_display_hint`("여기 뭐야")로 라우팅돼 단정 실패. (`soft_summary`는 현재도 PASS일 수 있음 — 회귀 가드용.)

- [ ] **Step 3: 구현**

`query_policy.py:78-89` 주소 블록:

```python
    address = _extract_address_anchor(text)
    if address:
        # risk · detail은 nearby보다 우선 — 단, "근처/주변"이 함께 있으면 nearby로 양보.
        if _RISK_RE.search(text) and not _NEARBY_RE.search(text):
            return _address_risk_hint(text, address)
        if (_DETAIL_RE.search(text) or _FEASIBILITY_RE.search(text)) and not _NEARBY_RE.search(text):
            return _address_detail_hint(text, address)
        if _NEARBY_RE.search(text):
            return _address_nearby_hint(text, address)
        if _DISPLAY_RE.search(text):
            return _address_display_hint(address)
        return _address_anchor_hint(address)
```

를 다음으로 교체:

```python
    address = _extract_address_anchor(text)
    if address:
        # risk · detail은 nearby보다 우선 — 단, "근처/주변"이 함께 있으면 nearby로 양보.
        if _RISK_RE.search(text) and not _NEARBY_RE.search(text):
            return _address_risk_hint(text, address)
        # 강한 통계 명사는 DETAIL보다 우선 — "건물통계 분석/차트"가 parcel_detail/display로 새지 않게.
        if _STATS_STRONG_RE.search(text) and not _NEARBY_RE.search(text):
            return _existing_stats_hint(text, "address", address, "300")
        if (_DETAIL_RE.search(text) or _FEASIBILITY_RE.search(text)) and not _NEARBY_RE.search(text):
            return _address_detail_hint(text, address)
        if _NEARBY_RE.search(text):
            return _address_nearby_hint(text, address)
        # 약한 통계 포함 — DETAIL·NEARBY가 아니면 통계로(현황/요약 등). DISPLAY보다 우선.
        if _STATS_RE.search(text):
            return _existing_stats_hint(text, "address", address, "300")
        if _DISPLAY_RE.search(text):
            return _address_display_hint(address)
        return _address_anchor_hint(address)
```

- [ ] **Step 4: 통과 확인 + 회귀**

Run: `cd qwen_mcp_bridge && uv run pytest tests/test_query_policy.py -q`
Expected: PASS (신규 3 + 기존 전부; `test_routing_hint_pure_address_remains_locate`·`_existing_stats_uses_statistics_tool` 등 회귀 0)

- [ ] **Step 5: 커밋**

```bash
cd qwen_mcp_bridge
git add src/qwen_mcp_bridge/query_policy.py tests/test_query_policy.py
git -c user.name='송민' -c user.email='imnimgnos@gmail.com' commit -m "fix(routing): 직접-주소 통계 질의를 NEARBY 없이 통계 도구로 라우팅"
```

---

### Task 3: current_parcel STATS 분기 (지도-클릭 흐름)

**Files:**
- Modify: `qwen_mcp_bridge/src/qwen_mcp_bridge/query_policy.py:91-106` (`build_routing_hint` current_parcel 블록)
- Test: `qwen_mcp_bridge/tests/test_query_policy.py`

**Interfaces:**
- Consumes: `_STATS_STRONG_RE`, `_STATS_RE`(Task1), 기존 `_current_parcel_stats_hint(text, current_context)`(line 605), `_is_current_parcel_reference`(line 217).

- [ ] **Step 1: 실패 테스트 작성**

`tests/test_query_policy.py` 끝에 추가:

```python
def test_routing_hint_map_click_stats_uses_centroid_one_call():
    """필지 클릭(current_parcel) + '건물통계 차트' (deictic·주변 없음) → centroid 1콜 통계."""
    hint = build_routing_hint(
        [{"role": "user", "content": "건물통계 차트 보여줘"}],
        current_parcel={"pnu": "1168010100101230045", "centroid": {"lng": 127.03, "lat": 37.49}},
    )
    assert hint is not None
    assert "bucket=기존 건축물 통계 조회" in hint
    assert "anchor_type=current_parcel" in hint
    assert "required_chain=current_parcel_centroid -> analyze__existing_building_statistics" in hint


def test_routing_hint_map_click_stats_without_centroid_uses_get_parcel():
    """centroid 없으면 pnu -> get_parcel -> statistics (2콜)."""
    hint = build_routing_hint(
        [{"role": "user", "content": "건물통계 차트 보여줘"}],
        current_parcel={"pnu": "1168010100101230045"},
    )
    assert hint is not None
    assert "bucket=기존 건축물 통계 조회" in hint
    assert "current_parcel_pnu -> locate__get_parcel -> analyze__existing_building_statistics" in hint


def test_routing_hint_map_click_non_stats_is_not_stats():
    """필지 클릭 + '분석해줘'(STATS 없음, deictic 없음) → 통계로 가지 않음(범위 최소)."""
    hint = build_routing_hint(
        [{"role": "user", "content": "분석해줘"}],
        current_parcel={"pnu": "1168010100101230045", "centroid": {"lng": 127.03, "lat": 37.49}},
    )
    assert hint is None or "기존 건축물 통계 조회" not in hint
```

- [ ] **Step 2: 실패 확인**

Run: `cd qwen_mcp_bridge && uv run pytest tests/test_query_policy.py -v -k "map_click_stats"`
Expected: FAIL — 현재는 `_is_current_parcel_reference`가 False라 힌트 None.

- [ ] **Step 3: 구현**

`query_policy.py:91-106`:

```python
    # address 없이도 current_parcel 분기 — risk/detail이 nearby보다 우선.
    if _is_current_parcel_reference(text, current_context):
        if _RISK_RE.search(text):
            return _current_parcel_risk_hint(text, current_context)
        if _DETAIL_RE.search(text) or _FEASIBILITY_RE.search(text):
            if not _NEARBY_RE.search(text):
                return _current_parcel_detail_hint(text, current_context)

    if _is_current_parcel_reference(text, current_context) and _NEARBY_RE.search(text):
        # 통계 의도면 stats hint, 아니면 기본 current_parcel nearby hint.
        if _STATS_RE.search(text):
            return _current_parcel_stats_hint(text, current_context)
        return _current_parcel_hint(current_context)

    if _is_current_parcel_reference(text, current_context) and current_context:
        return _current_parcel_hint(current_context)
```

를 다음으로 교체:

```python
    # address 없이도 current_parcel 분기 — risk가 최우선(기존, deictic 필요).
    if _is_current_parcel_reference(text, current_context):
        if _RISK_RE.search(text):
            return _current_parcel_risk_hint(text, current_context)

    # 지도-클릭 흐름: 필지 컨텍스트 + 강한 통계 명사 → deictic·nearby 없이도 통계 (DETAIL보다 우선).
    if current_context and _STATS_STRONG_RE.search(text):
        return _current_parcel_stats_hint(text, current_context)

    # detail/feasibility (기존, deictic 필요, nearby 아닐 때).
    if _is_current_parcel_reference(text, current_context):
        if _DETAIL_RE.search(text) or _FEASIBILITY_RE.search(text):
            if not _NEARBY_RE.search(text):
                return _current_parcel_detail_hint(text, current_context)

    if _is_current_parcel_reference(text, current_context) and _NEARBY_RE.search(text):
        # 통계 의도면 stats hint, 아니면 기본 current_parcel nearby hint.
        if _STATS_RE.search(text):
            return _current_parcel_stats_hint(text, current_context)
        return _current_parcel_hint(current_context)

    # 약한 통계 포함 — 필지 컨텍스트 있으면 deictic 없어도 통계 (detail/nearby 뒤).
    if current_context and _STATS_RE.search(text):
        return _current_parcel_stats_hint(text, current_context)

    if _is_current_parcel_reference(text, current_context) and current_context:
        return _current_parcel_hint(current_context)
```

- [ ] **Step 4: 통과 확인 + 회귀**

Run: `cd qwen_mcp_bridge && uv run pytest tests/test_query_policy.py tests/test_routing_debug.py -q`
Expected: PASS (신규 3 + 기존 전부; `test_routing_hint_current_parcel_stats_chain`·`_current_parcel_nearby_without_stats_unchanged`·`_current_parcel_detail_chain`·`_redacts_current_parcel_pnu` 회귀 0)

- [ ] **Step 5: 커밋**

```bash
cd qwen_mcp_bridge
git add src/qwen_mcp_bridge/query_policy.py tests/test_query_policy.py
git -c user.name='송민' -c user.email='imnimgnos@gmail.com' commit -m "fix(routing): 지도-클릭(current_parcel) 통계 질의를 deictic 없이 통계 도구로"
```

---

### Task 4: intent.py 라벨 동기화 + 픽스처

**Files:**
- Modify: `qwen_mcp_bridge/src/qwen_mcp_bridge/intent.py:11-29` (import), `:99-156` (classify_intent)
- Modify: `qwen_mcp_bridge/tests/scenario/fixtures/routing_debug_cases.json`
- Test: `qwen_mcp_bridge/tests/test_intent.py`, `qwen_mcp_bridge/tests/test_routing_debug.py`

**Interfaces:**
- Consumes: `_STATS_STRONG_RE`(Task1, query_policy에서 import), 기존 `_STATS_RE` import.

- [ ] **Step 1: 실패 테스트 작성**

`tests/test_intent.py` 끝에 추가:

```python
def test_direct_address_stats_chart_is_existing_building_stats():
    assert classify_intent(_user("강남구 역삼동 123-45 건물통계 차트 보여줘")) == "existing_building_stats"
    assert classify_intent(_user("역삼동 123-45 건물통계 분석해줘")) == "existing_building_stats"


def test_direct_address_soft_summary_stays_parcel_detail():
    assert classify_intent(_user("역삼동 123-45 분석 요약해줘")) == "parcel_detail"


def test_map_click_stats_is_existing_building_stats():
    assert (
        classify_intent(_user("건물통계 차트 보여줘"), has_current_parcel_context=True)
        == "existing_building_stats"
    )


def test_map_click_non_stats_is_not_stats():
    # '분석해줘'(deictic·STATS 없음) → 통계 아님 (범위 최소).
    assert (
        classify_intent(_user("분석해줘"), has_current_parcel_context=True)
        != "existing_building_stats"
    )
```

`tests/test_routing_debug.py` 끝에 추가:

```python
def test_routing_debug_direct_address_stats_no_nearby():
    debug = build_routing_debug([
        {"role": "user", "content": "강남구 역삼동 123-45 건물통계 차트 보여줘"},
    ])
    assert debug["intent"] == "existing_building_stats"
    assert debug["bucket"] == "기존 건축물 통계 조회"
    assert "analyze__existing_building_statistics" in debug["required_chain"]
```

`tests/scenario/fixtures/routing_debug_cases.json` 배열에 항목 추가(기존 마지막 `}` 뒤, `]` 앞에 콤마+블록):

```json
  ,{
    "name": "existing_building_stats_address_direct_no_nearby",
    "messages": [
      { "role": "user", "content": "강남구 역삼동 123-45 건물통계 차트 보여줘" }
    ],
    "expected": {
      "intent": "existing_building_stats",
      "bucket": "기존 건축물 통계 조회",
      "anchor": { "type": "address", "text": "강남구 역삼동 123-45" },
      "required_chain": {
        "contains": ["locate__search_address", "locate__get_parcel", "analyze__existing_building_statistics"],
        "not_contains": ["analyze__find_existing_buildings", "analyze__find_parcels"]
      },
      "visual": { "suppress": "intermediate_parcel_candidates", "required": false }
    }
  }
```

- [ ] **Step 2: 실패 확인**

Run: `cd qwen_mcp_bridge && uv run pytest tests/test_intent.py tests/test_routing_debug.py tests/scenario/test_routing_debug_fixtures.py -v -k "direct_address_stats or map_click_stats or no_nearby"`
Expected: FAIL — classify_intent이 "locate_show"/"general" 반환, 픽스처 anchor 불일치.

- [ ] **Step 3: 구현**

(a) import 동기화 — `intent.py:11-29` import 블록에 `_STATS_STRONG_RE` 추가. 기존:

```python
from qwen_mcp_bridge.query_policy import (
    _BUILD_CANDIDATE_RE,
    _CURRENT_PARCEL_RE,
    _DETAIL_RE as _QP_DETAIL_RE,
    _DISPLAY_RE,
    _FEASIBILITY_RE,
    _LIST_RE,
    _MULTIFAMILY_RE,
    _NEARBY_RE,
    _RECENT_CONTEXT_RE,
    _RISK_RE as _QP_RISK_RE,
    _STATS_RE,
    _extract_address_anchor,
    ...
)
```

`_STATS_RE,` 바로 위에 한 줄 추가:

```python
    _STATS_STRONG_RE,
    _STATS_RE,
```

(b) classify_intent — RISK 분기 직후(`intent.py:99-100`, `if _RISK_RE.search(text): return "risk_check"` 다음 줄)에 지도-클릭 strong 통계 분기 삽입:

```python
    if _RISK_RE.search(text):
        return "risk_check"

    # 지도-클릭: 필지 컨텍스트 + 강한 통계 명사 → DETAIL보다 우선 (주소 없을 때).
    if has_current_parcel_context and _STATS_STRONG_RE.search(text) and not _extract_address_anchor(text):
        return "existing_building_stats"
```

(c) 주소 블록 — `intent.py:123-130`의 nearby 없을 때 분기:

```python
        # 주소 anchor 있고 nearby 없을 때:
        # "분석/상세/검토/가능해" 등 분석 의도가 있으면 parcel_detail (locate_show가 아님).
        if _DETAIL_RE.search(text):
            return "parcel_detail"
        if _DISPLAY_RE.search(text):
            return "locate_show"
        # 주소만 단독 — 위치 보여달라는 의도와 동의어로 처리.
        return "locate_show"
```

를 다음으로 교체:

```python
        # 주소 anchor 있고 nearby 없을 때:
        # 강한 통계 명사는 DETAIL/DISPLAY보다 우선.
        if _STATS_STRONG_RE.search(text):
            return "existing_building_stats"
        # "분석/상세/검토/가능해" 등 분석 의도가 있으면 parcel_detail (locate_show가 아님).
        if _DETAIL_RE.search(text):
            return "parcel_detail"
        # 약한 통계 포함 — DISPLAY보다 우선.
        if _STATS_RE.search(text):
            return "existing_building_stats"
        if _DISPLAY_RE.search(text):
            return "locate_show"
        # 주소만 단독 — 위치 보여달라는 의도와 동의어로 처리.
        return "locate_show"
```

(d) current_parcel 약한 통계 — `intent.py:132-136`의 `if is_current_parcel and _NEARBY_RE.search(text):` 블록 **뒤에** 한 블록 추가:

```python
    if is_current_parcel and _NEARBY_RE.search(text):
        # 현재 필지 주변 + 통계 의도 → existing_building_stats.
        if _STATS_RE.search(text):
            return "existing_building_stats"
        return "nearby_context"

    # 지도-클릭(약한 통계 포함): 필지 컨텍스트 + 통계 의도 → existing_building_stats.
    if has_current_parcel_context and _STATS_RE.search(text) and not _extract_address_anchor(text):
        return "existing_building_stats"
```

- [ ] **Step 4: 통과 확인 + 회귀**

Run: `cd qwen_mcp_bridge && uv run pytest tests/test_intent.py tests/test_routing_debug.py tests/scenario/ -q`
Expected: PASS (신규 + 기존 전부; `test_address_only_is_locate_show`·`test_address_with_detail_intent_is_parcel_detail`·`test_stats_intent_for_address_with_stats_keywords`·픽스처 5+1 회귀 0)

- [ ] **Step 5: 커밋**

```bash
cd qwen_mcp_bridge
git add src/qwen_mcp_bridge/intent.py tests/test_intent.py tests/test_routing_debug.py tests/scenario/fixtures/routing_debug_cases.json
git -c user.name='송민' -c user.email='imnimgnos@gmail.com' commit -m "fix(intent): 통계 라벨을 NEARBY 종속에서 분리 (query_policy와 동기)"
```

---

### Task 5: poit centroid 주입

**Files:**
- Create: `poit/lib/chat/parcelMetadata.ts`
- Modify: `poit/components/workspace/chat/ChatPanel.tsx:104-122`
- Test: `poit/tests/lib/chat/parcelMetadata.test.ts`

**Interfaces:**
- Consumes: 기존 `polygonCentroid(geom): [number, number] | null`(`poit/lib/maplibre/geoJsonHelpers.ts:57`), `Parcel`(`poit/types/analysis.ts:3`, `geometry: Polygon | MultiPolygon`).
- Produces: `buildCurrentParcelMetadata(parcels: Parcel[], excludedPnus: string[]): { current_parcel: { pnu: string; address?: string; centroid?: [number, number] } } | undefined`.

- [ ] **Step 1: 실패 테스트 작성**

`poit/tests/lib/chat/parcelMetadata.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import { buildCurrentParcelMetadata } from '@/lib/chat/parcelMetadata';
import { polygonCentroid } from '@/lib/maplibre/geoJsonHelpers';
import type { Parcel } from '@/types/analysis';

function parcel(pnu: string, ring: number[][]): Parcel {
  return {
    pnu,
    address: `주소-${pnu}`,
    area: 100,
    zoneType: '대',
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

const SQUARE = [[127.0, 37.5], [127.001, 37.5], [127.001, 37.501], [127.0, 37.501], [127.0, 37.5]];

describe('buildCurrentParcelMetadata', () => {
  it('필지 1개면 pnu·address·centroid 포함', () => {
    const p = parcel('1168010100101230045', SQUARE);
    const meta = buildCurrentParcelMetadata([p], []);
    expect(meta).toBeDefined();
    expect(meta!.current_parcel.pnu).toBe('1168010100101230045');
    expect(meta!.current_parcel.address).toBe('주소-1168010100101230045');
    expect(meta!.current_parcel.centroid).toEqual(polygonCentroid(p.geometry));
  });

  it('포함 필지가 0개거나 2개면 undefined', () => {
    expect(buildCurrentParcelMetadata([], [])).toBeUndefined();
    expect(buildCurrentParcelMetadata(
      [parcel('a1234', SQUARE), parcel('b1234', SQUARE)], [],
    )).toBeUndefined();
  });

  it('excludedPnus 제외 후 1개면 그 필지로', () => {
    const meta = buildCurrentParcelMetadata(
      [parcel('keep1234', SQUARE), parcel('drop1234', SQUARE)], ['drop1234'],
    );
    expect(meta!.current_parcel.pnu).toBe('keep1234');
  });

  it('geometry가 비면 centroid 생략', () => {
    const meta = buildCurrentParcelMetadata([parcel('empty1234', [])], []);
    expect(meta!.current_parcel.pnu).toBe('empty1234');
    expect(meta!.current_parcel.centroid).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd poit && npx vitest run tests/lib/chat/parcelMetadata.test.ts`
Expected: FAIL — `Cannot find module '@/lib/chat/parcelMetadata'`

- [ ] **Step 3: 구현**

`poit/lib/chat/parcelMetadata.ts` 생성:

```ts
import type { Parcel } from '@/types/analysis';
import { polygonCentroid } from '@/lib/maplibre/geoJsonHelpers';

export interface CurrentParcelMetadata {
  current_parcel: {
    pnu: string;
    address?: string;
    centroid?: [number, number];
  };
}

/** 선택 필지가 (제외 후) 정확히 1개일 때만 current_parcel 메타데이터 생성 (없으면 undefined). */
export function buildCurrentParcelMetadata(
  parcels: Parcel[],
  excludedPnus: string[],
): CurrentParcelMetadata | undefined {
  const included = parcels.filter(p => !excludedPnus.includes(p.pnu));
  if (included.length !== 1) return undefined;
  const p = included[0];
  const meta: CurrentParcelMetadata['current_parcel'] = { pnu: p.pnu };
  if (p.address) meta.address = p.address;
  const centroid = polygonCentroid(p.geometry);
  if (centroid) meta.centroid = centroid;
  return { current_parcel: meta };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd poit && npx vitest run tests/lib/chat/parcelMetadata.test.ts`
Expected: PASS (4)

- [ ] **Step 5: ChatPanel 배선**

`ChatPanel.tsx` 상단 import 블록에 추가:

```ts
import { buildCurrentParcelMetadata } from '@/lib/chat/parcelMetadata';
```

`ChatPanel.tsx:103-111`의 인라인 함수:

```ts
  // current_parcel 메타데이터 — 선택 필지가 정확히 1개일 때만 포함
  function buildParcelMetadata() {
    const included = wizard.parcels.filter(p => !wizard.excludedPnus.includes(p.pnu));
    if (included.length !== 1) return undefined;
    const p = included[0];
    const meta: Record<string, unknown> = { pnu: p.pnu };
    if (p.address) meta.address = p.address;
    return { current_parcel: meta };
  }
```

를 삭제하고, `runStream` 내부 `const metadata = buildParcelMetadata();`(line 122)를 다음으로 교체:

```ts
    const metadata = buildCurrentParcelMetadata(wizard.parcels, wizard.excludedPnus);
```

- [ ] **Step 6: 타입·회귀 확인**

Run: `cd poit && npx tsc --noEmit && npm run test:ci`
Expected: tsc 0 에러, vitest 전체 PASS (신규 4 포함)

- [ ] **Step 7: 커밋**

```bash
cd poit
git add lib/chat/parcelMetadata.ts components/workspace/chat/ChatPanel.tsx tests/lib/chat/parcelMetadata.test.ts
git -c user.name='송민' -c user.email='imnimgnos@gmail.com' commit -m "feat(chat): current_parcel에 centroid 주입 — 통계 체인 1콜 단축"
```

---

### Task 6: 통합 검증 + 서브모듈 포인터 갱신

**Files:** (커밋만)

- [ ] **Step 1: 양 레포 전체 그린 확인**

```bash
cd /home/nimgnos/poit-ai/qwen_mcp_bridge && uv run pytest -q
cd /home/nimgnos/poit-ai/poit && npm run test:ci && npx tsc --noEmit && npm run lint
```
Expected: 전부 PASS, tsc 0, lint 0.

- [ ] **Step 2: 브릿지 재기동 (라이브 함정 방지)**

> 메모리 `chatbot-graph-priority`/핸드오프: urban_mcp/bridge 코드 수정 후 **브릿지 재기동 필수**(stale spawn). `pkill -f`는 자가종료(exit144) 위험 → **pgid kill** 사용. poit dev도 HMR 재기동.
(라이브 검증은 선택 — 사용자 요청 시. 자동 검증은 위 단위/통합 테스트로 충족.)

- [ ] **Step 3: 자식 push → 부모 포인터 갱신 (사용자 승인 후)**

```bash
# 자식 먼저 (push.recurseSubmodules=check 가드)
cd /home/nimgnos/poit-ai/qwen_mcp_bridge && git push
cd /home/nimgnos/poit-ai/poit && git push
# 부모 포인터
cd /home/nimgnos/poit-ai
git add qwen_mcp_bridge poit docs 2>/dev/null; git status
git -c user.name='송민' -c user.email='imnimgnos@gmail.com' commit -m "chore: 챗봇 건물통계 차트 라우팅 안정화 서브모듈 포인터 갱신"
git push
```

> 주의: `Makefile`의 `SUBS`는 poit를 건너뜀 — poit는 `git -C poit ...`로 직접. push/부모커밋은 **사용자 승인 시에만**.

---

## Self-Review

**1. Spec coverage:**
- §4.1 강/약 분리 → Task1 ✓
- §4.2 주소 분기 precedence → Task2 ✓
- §4.3 current_parcel 분기 → Task3 ✓
- §4.4 centroid 주입 → Task5 ✓
- 라벨 동기화(§3 2차 수정면) → Task4 ✓
- §7 테스트 케이스(6 레드) → Task2(3)+Task3(3)+Task4(intent4+debug1+fixture1)+Task5(4) 커버 ✓
- §5 동작 표 회귀 불변 항목 → Task2/3/4의 회귀 가드 테스트 + 기존 스위트 ✓

**2. Placeholder scan:** 모든 step에 실제 코드/명령/기대출력 포함. TBD/TODO 없음 ✓

**3. Type consistency:** `buildCurrentParcelMetadata` 시그니처가 Task5 정의↔ChatPanel 호출 일치. `_STATS_STRONG_RE`/`_STATS_RE` 이름이 Task1 정의↔Task2/3/4 사용 일치. `_existing_stats_hint`/`_current_parcel_stats_hint`는 기존 함수 재사용(시그니처 검증됨) ✓
