"""Scenario: 주변 기존 건축물 조회.

"양재동 344-7 근처 다세대주택" 같이 building 의도 단어가 없는 경우는
intent="existing_buildings"로 분류되고, find_parcels 결과는 frontend 시각화에서
skip 대상(shouldRenderToolResult==False)이어야 한다.

이 테스트는 bridge 레이어(classify_intent + shouldRenderToolResult)만 검증한다.
frontend module은 ts라 직접 호출 불가 — Python 측은 라벨까지만, ts 로직은 별도
vitest로 (P8에서). 여기선 contract 키만 고정.
"""
from qwen_mcp_bridge.intent import classify_intent


def _user(text: str) -> list[dict]:
    return [{"role": "user", "content": text}]


def test_existing_buildings_label_for_multifamily_query():
    label = classify_intent(_user("양재동 344-7 근처 다세대주택"))
    assert label == "existing_buildings"


def test_existing_buildings_blocks_intermediate_find_parcels_in_contract():
    """
    Contract 고정:
    intent="existing_buildings" → find_parcels / parcels_in_boundary 결과는
    frontend의 shouldRenderToolResult가 False를 반환해야 한다.

    TS 함수를 직접 호출할 수 없으므로 여기선 contract 사양만 docstring으로 보존.
    실제 동작 검증은 web/tests vitest (T8 단계)에서 추가.
    """
    # contract: shouldRenderToolResult("analyze__find_parcels", "existing_buildings") === false
    # contract: shouldRenderToolResult("locate__parcels_in_boundary", "existing_buildings") === false
    assert classify_intent(_user("양재동 344-7 근처 다세대주택")) == "existing_buildings"
