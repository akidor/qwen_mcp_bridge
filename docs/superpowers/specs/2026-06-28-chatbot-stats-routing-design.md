# 챗봇 건물통계 차트 라우팅 안정화 — 설계

- 날짜: 2026-06-28
- 범위: `qwen_mcp_bridge`(핵심) + `poit`(centroid 주입)
- 상태: 설계 승인됨(정책3 + v1=건물통계 + 수정①②③ 포함)

## 1. 배경 / 문제

특정 필지를 가리키며 건물통계 차트를 요청할 때 차트가 불안정하게 생성된다.

- 보고된 증상(핸드오프): "특정 필지주소 질의 → 모델이 주소 해석에 도구예산을 써 차트 도구 미도달 → 직접 PNU/좌표 질의가 안정적."
- 예: `서울시 강남구 역삼동 123-45 건물통계 차트 보여줘` → 차트 미생성/불안정.

### 핸드오프 진단 정정 (코드 확인 결과)

1. **"도구예산 5콜 소진"은 오진.** 실제 예산은 12다(`config.py:18` `max_tool_iterations=12`). 서버가 스트리밍/비스트리밍 양쪽에 항상 이 값을 넘긴다(`server.py:105,127`). 함수 시그니처의 `max_iterations=5` 기본값은 프로덕션에서 호출되지 않는 죽은 기본값. 정상 경로는 `search_address → get_parcel → existing_building_statistics` = 3콜로 예산 안에 충분. **예산을 늘려도 안 풀린다.**
2. **실제 도구 조종은 `intent.py`가 아니라 `query_policy.build_routing_hint`가 한다.** intent 라벨은 SSE 메타·디버그 패널용 관측치(`chat_loop_streaming.py:219-224`)일 뿐이고, 모델이 읽는 것은 system prompt에 붙는 라우팅 힌트 텍스트(`server.py:80-82`)다.

## 2. 근본원인

`existing_building_statistics`(건물통계)로 가는 **결정적 라우팅 힌트가 "주변/근처/인근/반경"(NEARBY) 단어에 종속**돼 있다. 그 결과 두 흐름이 모두 차트 도구로 안내되지 못한다.

### 흐름 A — 직접-주소 타이핑
`build_routing_hint`의 주소 분기(`query_policy.py:78-89`) 순서: RISK → DETAIL/FEAS → **NEARBY** → DISPLAY → anchor.
- `_STATS_RE`(`query_policy.py:38-46`)는 "건물통계"를 매칭하지만, STATS 분기는 **NEARBY 블록 안에서만** 검사된다(`_address_nearby_hint`, line 365-366).
- 따라서 "주변" 없는 `역삼동 123-45 건물통계 차트 보여줘`는 `_DISPLAY_RE`의 "보여"에 먼저 걸려 `_address_display_hint`(line 443-451, `bucket=여기 뭐야`, 체인이 `get_parcel`에서 끝, 차트 도구 미언급)로 라우팅된다. "보여"(DISPLAY)가 "통계"(STATS)를 이긴다.
- `intent.py:110-130`도 동일 구조(STATS가 112번 NEARBY 블록 안에만, 127번 DISPLAY가 먼저 반환).

### 흐름 B — 지도-클릭 (더 큰 구멍)
필지를 클릭만 하고 `건물통계 차트 보여줘`라고 치면, 텍스트에 주소도·"이 필지/여기"(deictic)도·"주변"도 없다.
- `_is_current_parcel_reference`(`query_policy.py:217-220`)가 False → 현재필지 분기(line 92-106)를 전부 건너뜀 → **라우팅 힌트 None**(모델 완전 무가이드).
- `intent.py`도 `is_current_parcel`=False → 최종 `general`로 떨어짐.
- 프론트는 필지 1개 선택 시 `current_parcel:{pnu,address}`를 보내고 있으므로(`ChatPanel.tsx:104-111`) 컨텍스트는 존재하는데도 활용되지 못한다.

## 3. 수정면

- **1차: `qwen_mcp_bridge/src/qwen_mcp_bridge/query_policy.py`** — 실제 모델 조종(라우팅 힌트).
- **2차: `qwen_mcp_bridge/src/qwen_mcp_bridge/intent.py`** — 라벨 일관성(SSE 메타·디버그·계약 테스트). 파일 주석상 "단일 source of truth는 query_policy" 이므로 동기 유지.
- **3차: `poit/components/workspace/chat/ChatPanel.tsx`** — centroid 주입(효율).

## 4. 설계

### 4.1 STATS 강/약 분리 (정책3)

`_STATS_RE`를 두 세트로 나눈다. **`_STATS_RE`는 둘의 합집합으로 유지**해 기존 참조(NEARBY 내부 분기 등 line 101/117/120/134/147/150/366/506)의 동작을 100% 보존한다.

```python
# 강(strong): 명백한 수량·분포 명사 — 검토/요약 맥락에 거의 안 섞임 → DETAIL보다 우선
_STATS_STRONG_RE = re.compile(
    r"통계치|통계|분포|밀도|집계|"
    r"개수|카운트|수량|몇\s*개|몇\s*곳|몇\s*동|몇\s*필지|총\s*몇|총량|"
    r"비율|비중|평균|중앙값|합계"
)
# 약(soft): 검토/요약 맥락에도 섞이는 단어 → DETAIL 뒤
_STATS_SOFT_RE = re.compile(
    r"현황|요약|구성|얼마나(?:\s*있|야|인가|인지)?"
)
# 합집합 — 기존 동작 보존용 (기존 코드의 _STATS_RE 참조는 전부 그대로)
_STATS_RE = re.compile(f"(?:{_STATS_STRONG_RE.pattern})|(?:{_STATS_SOFT_RE.pattern})")
```

### 4.2 주소 분기 precedence (`build_routing_hint`, NEARBY 없을 때)

```
RISK → strong-STATS → DETAIL/FEASIBILITY → (NEARBY 블록, 기존 그대로) → full-STATS → DISPLAY → anchor
```

구현: `query_policy.py:78-89` 주소 블록에 두 줄 삽입.
- `_RISK_RE and not NEARBY` 직후: `if _STATS_STRONG_RE.search(text) and not _NEARBY_RE.search(text): return _existing_stats_hint(text, "address", address, "300")`
- DETAIL/FEAS 분기와 NEARBY 분기 이후, DISPLAY 분기 직전: `if _STATS_RE.search(text): return _existing_stats_hint(text, "address", address, "300")`

`_existing_stats_hint`(line 394-422)는 이미 존재하며 주소용 체인 `search_address → get_parcel → existing_building_statistics(lng,lat,...)`를 생성한다. 재사용.

### 4.3 current_parcel 분기 (흐름 B, 지도-클릭)

`current_context`(필지 선택)가 있고 STATS 의도면, **deictic·NEARBY 단어 없이도** stats로 라우팅한다. RISK/DETAIL의 기존 게이팅은 **v1에서 건드리지 않는다**(STATS만 완화 — 범위 최소).

구현: `query_policy.py` 주소 블록(`address` is None로 진입) 이후, 현재필지 분기에 추가. 주소가 함께 있으면 주소 분기가 먼저 처리되므로 우선순위 충돌 없음.
- strong-STATS: `if current_context and _STATS_STRONG_RE.search(text): return _current_parcel_stats_hint(text, current_context)` — 기존 `_is_current_parcel_reference` 게이트보다 앞에 둔다.
- full-STATS(약 포함): 기존 DETAIL 분기 뒤, fallback 전에 `if current_context and _STATS_RE.search(text): return _current_parcel_stats_hint(text, current_context)`.

`_current_parcel_stats_hint`(line 605-649)는 이미 존재하며 centroid 있으면 `current_parcel_centroid → statistics`(1콜), 없으면 `current_parcel_pnu → get_parcel → statistics`(2콜) 체인을 생성한다. 재사용.

### 4.4 centroid 주입 (`poit`, 효율)

`ChatPanel.tsx`의 `buildParcelMetadata()`(line 104-111)가 `current_parcel`에 `centroid:[lng,lat]`를 추가한다.

```ts
import { polygonCentroid } from '@/lib/maplibre/geoJsonHelpers';
// ...
const meta: Record<string, unknown> = { pnu: p.pnu };
if (p.address) meta.address = p.address;
const c = polygonCentroid(p.geometry);     // [lng,lat] | null
if (c) meta.centroid = c;                  // 백엔드 _normalize_centroid가 [lng,lat] 수용
```

- `polygonCentroid`(geoJsonHelpers.ts:57)는 ring vertex 평균(≈bbox 중심) — 반경 기반 통계 anchor로 충분.
- 백엔드 `_normalize_centroid`(query_policy.py:178-207)는 `[lng,lat]` 리스트와 `{lng,lat}` dict 둘 다 수용. 추가 백엔드 변경 불필요.
- `streamChat.ts:18` 메타 주석은 이미 `{ pnu, address, centroid }`를 명시 — 계약 정합.

효과: 흐름 B 체인이 `get_parcel`을 건너뛰어 1콜로 단축.

## 5. 동작 표

| 질의 (필지 선택 여부) | 변경 후 결과 | 비고 |
|---|---|---|
| `역삼동 123-45 건물통계 차트 보여줘` | existing_building_stats | 핵심 실패 케이스(흐름 A) 해결 |
| `역삼동 123-45 건물통계 분석해줘` | existing_building_stats | strong-STATS가 DETAIL보다 우선 |
| `역삼동 123-45 분석 요약` | parcel_detail | soft(요약)이 DETAIL 가로채지 않음 |
| `역삼동 123-45 위치 보여줘` | locate_show | **회귀 불변** (`test_intent.py:10` 계약) |
| `쌍동리 254-7` (주소 단독) | locate_show | **회귀 불변** (`test_intent.py:9`) |
| `역삼동 123-45 주변 건물통계` | existing_building_stats | **기존 유지** (NEARBY 블록) |
| `건물통계 차트 보여줘` (필지 클릭됨) | existing_building_stats | 흐름 B 해결, centroid면 1콜 |
| `분석해줘` (필지 클릭됨, STATS 없음) | parcel_detail/general | **불변** (STATS만 완화) |

## 6. 엣지케이스 & 결정

- **soft-STATS 직접-주소** (`역삼동 123-45 현황`, `역삼동 123-45 요약해줘`): DETAIL/NEARBY 없으면 full-STATS 분기로 stats. 변경 전엔 generic anchor. **수용**(주소 주변 현황/요약 = 통계로 해석 합리적). 부담되면 spec 리뷰에서 4.2의 full-STATS 줄 제거 → strong만 라우팅하도록 축소 가능.
- **"차트/그래프"만 있고 통계명사 없음** (`역삼동 123-45 차트 그려줘`): *무엇의* 차트인지 결정 불가(건물통계/용도지역/그림자…). v1은 모델 위임(변경 없음).
- **필지 선택 + 다른 주소 타이핑**: 주소 분기 우선(기존 구조) → 타이핑한 주소 기준 stats.

## 7. 테스트 계획 (TDD)

기존 인프라 재사용: `tests/test_query_policy.py`, `tests/test_intent.py`, `tests/test_routing_debug.py`, `tests/scenario/fixtures/routing_debug_cases.json`(이미 `existing_building_stats_direct` 픽스처 존재).

레드 케이스(추가):
1. `역삼동 123-45 건물통계 차트 보여줘` → 힌트 bucket=`기존 건축물 통계 조회`, 체인에 `existing_building_statistics` 포함 / intent=`existing_building_stats`.
2. `역삼동 123-45 건물통계 분석해줘` → 동일(strong before DETAIL).
3. `역삼동 123-45 분석 요약` → parcel_detail (회귀 가드).
4. `역삼동 123-45 위치 보여줘` → locate_show (회귀 가드, 기존 테스트 유지).
5. 흐름 B: `current_parcel={pnu,centroid}` + `건물통계 차트 보여줘` → `_current_parcel_stats_hint`, 체인이 `current_parcel_centroid → existing_building_statistics`(1콜).
6. 흐름 B centroid 없음: `current_parcel={pnu}` + 동일 질의 → 체인 `current_parcel_pnu → get_parcel → existing_building_statistics`.

poit: `tests/lib/...` 또는 컴포넌트 단위로 `buildParcelMetadata` 동등 로직(geometry → centroid 포함) 1 테스트. (ChatPanel 직접 테스트 어려우면 centroid 추출 헬퍼 경로로 검증.)

전체 회귀: `cd qwen_mcp_bridge && uv run pytest -q`, `cd poit && npm run test:ci` + `npx tsc --noEmit`.

## 8. 영향 파일

- `qwen_mcp_bridge/src/qwen_mcp_bridge/query_policy.py` — 4.1 regex 분리, 4.2 주소 분기, 4.3 현재필지 분기 (핵심)
- `qwen_mcp_bridge/src/qwen_mcp_bridge/intent.py` — 라벨 동기화(주소 strong-STATS, 현재필지 STATS)
- `qwen_mcp_bridge/tests/{test_query_policy,test_intent,test_routing_debug}.py` + `scenario/fixtures/routing_debug_cases.json`
- `poit/components/workspace/chat/ChatPanel.tsx` (+테스트) — 4.4 centroid

## 9. 비범위 (v1 제외)

- 용도지역(`get_land_use`)·그림자(`shadow_analysis`)·주차(`parking_estimate`) 라우팅 — 이들은 query_policy에 결정적 라우팅이 없고 system prompt 모델 위임. NEARBY-종속 결함 없음(다른 종류의 불안정성일 수 있으나 원인 다름). 실제 불안정 관찰되면 별도 spec.
- RISK/DETAIL 게이팅 변경 — 현재필지 분기에서 STATS만 완화. RISK/DETAIL은 기존 deictic 게이트 유지.
- 도구예산(`max_tool_iterations`) 변경 — 무효(이미 12, 병목 아님). 데드코드 `=5` 기본값 정리는 선택적 후속.

## 10. 리스크 / 롤백

- 회귀 위험 낮음: `_STATS_RE`를 합집합으로 유지해 기존 분기 불변. 신규 동작은 "STATS 단어가 있는 직접-주소/현재필지 질의"로 한정 — 기존 locate_show 계약(STATS 단어 없음)과 분리.
- 롤백: query_policy/intent 변경은 순수 함수 + 결정적 테스트라 revert 단순. centroid 주입은 백엔드가 옵션 필드로 받으므로 프론트 단독 revert 가능.
