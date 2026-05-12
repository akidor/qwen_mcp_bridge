from qwen_mcp_bridge.query_policy import build_routing_hint


def test_routing_hint_keeps_jibun_nearby_query_on_address_anchor():
    hint = build_routing_hint([
        {"role": "user", "content": "양재동 344-7번지 근처에 다세대주택 리스트"},
    ])

    assert hint is not None
    assert "anchor_type=address" in hint
    assert "anchor_text=양재동 344-7번지" in hint
    assert "locate__search_facility" in hint
    assert "금지" in hint
    assert "locate__search_address -> locate__get_parcel -> analyze__find_parcels" in hint
    assert "radius_m=300" in hint


def test_routing_hint_uses_facility_anchor_for_station_nearby_query():
    hint = build_routing_hint([
        {"role": "user", "content": "양재역 근처 100평 땅 리스트업 해줘"},
    ])

    assert hint is not None
    assert "anchor_type=facility" in hint
    assert "anchor_text=양재역" in hint
    assert "locate__search_facility -> analyze__find_parcels" in hint
    assert "100평" in hint


def test_routing_hint_prefers_address_when_address_and_station_like_text_overlap():
    hint = build_routing_hint([
        {"role": "user", "content": "양재동 344-7번지 근처 다세대 말고 다가구 후보"},
    ])

    assert hint is not None
    assert "anchor_type=address" in hint
    assert "anchor_text=양재동 344-7번지" in hint
    assert "locate__search_facility" in hint
    assert "금지" in hint


def test_routing_hint_for_current_parcel_reference_asks_for_recent_context():
    hint = build_routing_hint([
        {"role": "user", "content": "이 필지 주변에서 같이 볼 만한 인접 필지 찾아줘"},
    ])

    assert hint is not None
    assert "anchor_type=current_parcel" in hint
    assert "최근 선택된 필지" in hint
    assert "없으면 사용자에게 기준 필지를 물어볼 것" in hint


def test_routing_hint_returns_none_for_plain_smalltalk():
    assert build_routing_hint([
        {"role": "user", "content": "안녕"},
    ]) is None
