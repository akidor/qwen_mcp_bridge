# 매스 생성 도구 라우팅 — generate_scene 우선 (설계)

- 날짜: 2026-06-29
- 범위: `qwen_mcp_bridge` 단독 (시스템 프롬프트)
- 상태: 설계 승인됨(브릿지 프롬프트만)

## 1. 배경 / 문제

챗봇이 "매스 만들어줘" 류 요청에 `design__generate_volume`을 선호한다. 이 도구는 `scene_data`를 반환하지 않아 poit의 3D 후보 카드(`MassCandidateCard`)와 C2 scene 주입이 트리거되지 않는다. `scene_data`(3D 뷰어 렌더 + 카드)는 `design__generate_scene`만 반환한다.

라이브 확인(2026-06-29): "강남구 역삼동 738-1 ... 매스를 3D로 생성해줘" → 모델이 `design__generate_volume` 호출(`generate_scene` 아님). 원인: 모델은 도구 description으로 선택하는데, `generate_volume` description이 매스 트리거("N층 건물 짓고/신축 매스 만들고/건물 부피 생성")를 풍부히 담고, `generate_scene`은 "generate_volume과 동일 입력, +scene_data"로 빈약. 또 bridge `prompts.py:14` 도메인 요약이 `generate_volume`만 노출, `generate_scene`은 line 74의 후속 언급뿐.

## 2. 목표

사용자 대면 매스 생성/3D·장면 시각화 요청을 `design__generate_scene`으로 라우팅해, 3D 뷰어 렌더 + 후보 카드 + C2 주입이 실제로 동작하게 한다. `generate_volume`은 3D 표시가 불필요한 내부 부피 계산용으로 남긴다.

## 3. 안전성 (체인 비파괴)

`simulate.shadow_analysis`·`estimate.cost_detail`는 신 형태 `{pnu, candidate?, opts?}`를 직접 받는다(cost_detail.py:34, shadow_analysis.py:13) — generate_volume 결과를 참조하지 않는다. 따라서 매스 요청을 generate_scene으로 돌려도 그림자/공사비 체인은 안 깨진다. 두 생성기는 동일 입력·동일 후보를 내므로 candidate 인덱스도 호환.

## 4. 설계 (프롬프트 2곳 수정, prompts.py)

1. **도메인 요약(line 14)**: `generate_scene`을 사용자 대면 기본으로 앞에 추가 — `- design__: 매스·시나리오 (generate_scene, generate_volume, scenario_*, unit_layout, ...)`.
2. **매스 도구 선택 규칙(line 74 확장)**: item 15 끝의 generate_scene chain 언급 뒤에 명시 규칙 추가:
   - 매스/건물/N층/신축/3D/장면을 **생성·시각화**해달라 → `design__generate_scene(pnu)`(기본). scene_data로 3D 뷰어 렌더 + 후보 카드 자동 표시(클릭 시 그 매스가 3D로 열림).
   - `design__generate_volume`은 3D 표시 불필요한 내부 부피 계산용으로만.
   - 그림자/공사비/세대 후속은 generate 결과 없이 `{pnu, candidate, opts}`로 직접 호출 가능.

## 5. 검증

프롬프트 변경이라 단위테스트 불가 → **라이브 검증**: 브릿지 재기동 후 "이 필지(또는 주소) 매스 만들어줘 / 3D로 보여줘" 질의 → 모델이 `design__generate_scene` 호출(`generate_volume` 아님) 확인. 그림자 질의("이 부지 그림자 분석")는 여전히 정상 동작(체인 비파괴) 확인.

## 6. 비범위

- urban_mcp 도구 description 재서술 — 프롬프트만으로 부족하면 후속(더 강한 레버지만 별도 레포·재기동).
- query_policy 결정적 라우팅 힌트 추가 — 프롬프트 안내로 충분하면 불필요.
- C2 주입 로직 자체(이미 완료·머지).

## 7. 리스크

- 낮음: 프롬프트 텍스트만. 코드·계약 변경 0. 롤백 = 2 edit 되돌리기.
- 모델이 안내를 100% 따르지 않을 수 있음(LLM 확률적) → 라이브로 확인, 부족 시 §6의 description 레버로 강화.
