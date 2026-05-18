from qwen_mcp_bridge.routing_debug import build_routing_debug


def test_routing_debug_extracts_intent_bucket_anchor_and_chain():
    debug = build_routing_debug([
        {"role": "user", "content": "문정동 118-15 근처에 다세대주택 얼마나 있어?"},
    ])

    assert debug["intent"] == "existing_building_stats"
    assert debug["bucket"] == "기존 건축물 통계 조회"
    assert debug["anchor_type"] == "address"
    assert debug["anchor_text"] == "문정동 118-15"
    assert "analyze__existing_building_statistics" in debug["required_chain"]
    assert debug["radius_m"] == "300"
    assert debug["visual_suppress"] == "intermediate_parcel_candidates"
    assert "후보 리스트가 아니라 통계가 본문" in debug["answer_guard"]
    assert "### 브릿지 라우팅 힌트" in debug["routing_hint"]


def test_routing_debug_still_reports_general_without_hint():
    debug = build_routing_debug([
        {"role": "user", "content": "안녕"},
    ])

    assert debug["intent"] == "general"
    assert debug["routing_hint"] == ""
    assert "bucket" not in debug
