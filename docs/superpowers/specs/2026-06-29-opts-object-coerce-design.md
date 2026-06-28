# 툴 인자 object coercion — Qwen stringified-opts 해소 (설계)

- 날짜: 2026-06-29
- 범위: `qwen_mcp_bridge` 단독 (`mcp_pool._coerce_args`)
- 상태: 설계 승인됨(정밀안: 기존 함수에 object 분기 1개)

## 1. 배경 / 문제

Qwen(vLLM)이 툴콜의 중첩 `object` 인자(예: `design.generate_scene`/`generate_volume`의 `opts`)를 JSON **문자열**로 직렬화해 보낸다. urban_mcp의 jsonschema 검증이 `"... is not of type 'object', 'null'"`로 거부 → 매스 생성이 매번 실패하고, 재시도가 `MAX_TOOL_ITERATIONS=5`(.env)를 소진해 결과가 없다. 라이브 확인(2026-06-29): `generate_volume`·`generate_scene` 모두 동일 실패 → 챗봇 매스 플로우가 사전부터 깨져 있었음.

## 2. 근본원인

브릿지 `mcp_pool._coerce_args(args, schema)`(line 25-68)는 Qwen의 문자열 인자를 schema type 보고 `integer`/`number`/`boolean`/`array`로 복원한다. **그러나 `object` 타입 분기가 없다.** `opts`는 type `["object","null"]`이라 coercion을 못 받고 문자열로 남아 검증에서 탈락한다. (`_coerce_args`는 `dispatch`가 urban_mcp 호출 직전 line 187에서 적용.)

## 3. 설계

`_coerce_args`에 **object 분기 1개 추가** — 문자열 값이고 schema가 object 허용이며 `{`로 시작하면 `json.loads`해서 dict면 복원:

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

기존 array 분기와 동일 패턴. 배치: array 분기 직후(구조형 타입끼리). 변환 실패(파싱 불가·dict 아님)는 원본 문자열 유지(기존 동작과 일관 — 이후 검증이 명확한 에러).

## 4. 효과 / 안전성

- schema가 object를 허용하는 파라미터에만 적용 → **오탐 0**(주소·query·pnu 등 string 파라미터는 영향 없음).
- 모든 object 타입 인자에 일반 적용(opts 외 future 포함).
- 예산(5) 충분: 복원되면 generate_scene 1회 성공, 체인 `search_address→get_parcel→generate_scene`=3콜<5. **.env/예산 변경 불필요.**
- 이 수정 + 직전 프롬프트 라우팅(generate_scene 우선) = 챗봇 매스 요청이 scene_data 반환 → 3D 카드 + C2 주입 동작.

## 5. 검증

- **단위테스트**(`_coerce_args` 순수함수): (a) object 타입 + stringified-JSON `'{"height_max":12}'` → dict 복원; (b) object 타입 + 비-JSON 문자열 → 원본 유지; (c) `["object","null"]` 유니온 타입도 복원; (d) 기존 integer/number/boolean/array 동작 회귀 0.
- **라이브**: 브릿지 재기동 후 "역삼동 738-1 다세대 매스 3D로 보여줘" → generate_scene이 **검증 통과·scene_data 반환**(result_size 대형, candidates 포함) 확인. 그림자 질의 정상 확인.

## 6. 비범위

- 예산(MAX_TOOL_ITERATIONS) 변경 — 불필요(3콜<5).
- chat_loop의 schema-blind coercion — 불필요(schema-aware _coerce_args가 정답 위치).
- 중첩(nested) object 내부의 재귀 coercion — opts는 top-level이라 불필요(YAGNI).

## 7. 리스크

- 매우 낮음: 순수함수 1분기, schema-gated. 롤백 = 분기 제거.
- 잠재 오탐: object-타입 파라미터에 의도적으로 `{`로 시작하는 *문자열*을 넣는 경우 — 그런 파라미터는 정의상 object 타입이라 dict가 정상이며, 사용자 자유텍스트 string 파라미터(type=string)는 영향 없음.
