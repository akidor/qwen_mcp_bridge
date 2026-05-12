"""Scenario: 신축 후보 필지 탐색.

"양재동 344-7 근처 다세대주택 신축 후보 필지" → intent="new_build_candidates".
find_parcels 결과는 frontend가 1차 후보로 그린다(shouldRenderToolResult==True).
중간 단계 부적합 지목(도/하천/공원 등)은 backend find_parcels의
exclude_non_buildable=true 기본값으로 이미 제외됨.
"""
from qwen_mcp_bridge.intent import classify_intent


def _user(text: str) -> list[dict]:
    return [{"role": "user", "content": text}]


def test_new_build_label_for_build_intent():
    assert classify_intent(_user("양재동 344-7 근처 다세대주택 신축 후보 필지")) == "new_build_candidates"
    assert classify_intent(_user("강남역 근처 100평짜리 단독주택 지을 부지")) == "new_build_candidates"


def test_new_build_does_not_skip_find_parcels_in_contract():
    """
    Contract:
    intent="new_build_candidates" → find_parcels / parcels_in_boundary 결과는
    frontend shouldRenderToolResult가 True를 반환해 1차 후보로 시각화한다.
    """
    # contract: shouldRenderToolResult("analyze__find_parcels", "new_build_candidates") === true
    assert classify_intent(_user("양재동 344-7 근처 다세대주택 신축")) == "new_build_candidates"


def test_locate_show_intent_for_pure_address():
    """Contract: 주소만 단독 입력 — intent=locate_show, 지도에 단일 필지만 그림."""
    assert classify_intent(_user("쌍동리 254-7")) == "locate_show"
    assert classify_intent(_user("강남구 역삼동 738-1 위치 보여줘")) == "locate_show"
