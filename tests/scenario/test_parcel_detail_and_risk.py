"""Scenario: 단일 필지 상세(parcel_detail) + 매수 리스크(risk_check).

- "양재동 344-7 분석해줘" / "다세대 가능해?" 등은 parcel_detail.
- "이 땅 사도 돼?" 같은 발화는 risk_check.
- 두 intent 모두 chain에 analyze__evaluate_buildability가 포함되어야 한다.
"""
from qwen_mcp_bridge.intent import classify_intent
from qwen_mcp_bridge.query_policy import build_routing_hint


def _user(text: str) -> list[dict]:
    return [{"role": "user", "content": text}]


def test_parcel_detail_intent_for_address_with_detail_keywords():
    assert classify_intent(_user("양재동 344-7 분석해줘")) == "parcel_detail"
    assert classify_intent(_user("양재동 344-7 다세대 가능해?")) == "parcel_detail"
    assert classify_intent(_user("쌍동리 254-7 상세 검토")) == "parcel_detail"


def test_risk_check_intent_for_address_with_risk_keywords():
    assert classify_intent(_user("양재동 344-7 이 땅 사도 돼?")) == "risk_check"
    assert classify_intent(_user("쌍동리 254-7 매수 괜찮을까?")) == "risk_check"


def test_parcel_detail_routing_hint_includes_evaluate_buildability():
    hint = build_routing_hint(_user("양재동 344-7 다세대 가능해?"))
    assert hint is not None
    assert "analyze__evaluate_buildability" in hint
    assert 'existing_use_hint="다세대"' in hint


def test_risk_check_routing_hint_separates_external_verification():
    hint = build_routing_hint(_user("양재동 344-7 이 땅 사도 돼?"))
    assert hint is not None
    assert "analyze__evaluate_buildability" in hint
    assert "등기/현장/최신 건축물대장" in hint


def test_existing_buildings_intent_unchanged():
    assert classify_intent(_user("양재동 344-7 근처 다세대주택")) == "existing_buildings"


def test_new_build_candidates_intent_unchanged():
    assert classify_intent(_user("양재동 344-7 근처 다세대주택 신축 후보 필지")) == "new_build_candidates"
