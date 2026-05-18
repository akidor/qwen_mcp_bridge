from qwen_mcp_bridge.query_policy import build_routing_hint


def test_routing_hint_treats_multifamily_list_as_existing_building_search():
    hint = build_routing_hint([
        {"role": "user", "content": "양재동 344-7근처 다세대주택"},
    ])

    assert hint is not None
    assert "bucket=기존 건축물 조회" in hint
    assert "anchor_type=address" in hint
    assert "anchor_text=양재동 344-7" in hint
    assert "locate__search_facility" in hint
    assert "금지" in hint
    assert "analyze__find_existing_buildings" in hint
    assert "use_keywords=[다세대주택,다가구주택,공동주택,연립주택]" in hint
    assert "radius_m=300" in hint
    assert "visual_suppress=intermediate_parcel_candidates" in hint
    assert "existing_use=다세대주택" in hint
    assert "post_filter=건축 의도 있음" not in hint
    assert "건축 가능 후보" not in hint


def test_routing_hint_treats_explicit_multifamily_new_build_as_buildable_parcel_search():
    hint = build_routing_hint([
        {"role": "user", "content": "양재동 344-7번지 근처 다세대주택 신축 후보 필지 찾아줘"},
    ])

    assert hint is not None
    assert "bucket=신축 후보 필지 탐색" in hint
    assert "anchor_type=address" in hint
    assert "anchor_text=양재동 344-7번지" in hint
    assert "locate__search_address -> locate__get_parcel -> analyze__find_parcels" in hint
    assert "post_filter=건축 의도 있음" in hint
    assert "answer_guard=용도지역만으로 건축 가능 단정 금지" in hint


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


def test_routing_hint_current_parcel_context_detail_uses_internal_pnu():
    hint = build_routing_hint(
        [{"role": "user", "content": "여기 다세대 가능?"}],
        current_parcel={
            "address": "서울특별시 강남구 역삼동 738-1",
            "pnu": "1168010100107380001",
            "centroid": {"lng": 127.0331234, "lat": 37.4989876},
        },
    )

    assert hint is not None
    assert "bucket=현재 선택 필지 상세 검토" in hint
    assert "anchor_type=current_parcel" in hint
    assert "anchor_text=서울특별시 강남구 역삼동 738-1" in hint
    assert "current_parcel_pnu=1168010100107380001" in hint
    assert "current_parcel_centroid=127.033123,37.498988" in hint
    assert 'analyze__evaluate_buildability(current_parcel_pnu, existing_use_hint="다세대")' in hint
    assert "내부 current_parcel_pnu/PNU는 도구 호출 인자로만 사용" in hint


def test_routing_hint_current_parcel_context_resolves_banggeum_followup_to_centroid():
    hint = build_routing_hint(
        [{"role": "user", "content": "방금 그거 주변 인접 필지 찾아줘"}],
        current_parcel={
            "address": "서울특별시 강남구 역삼동 738-1",
            "pnu": "1168010100107380001",
            "centroid": {"lng": 127.0331234, "lat": 37.4989876},
        },
    )

    assert hint is not None
    assert "anchor_type=current_parcel" in hint
    assert "anchor_text=서울특별시 강남구 역삼동 738-1" in hint
    assert "current_parcel_centroid=127.033123,37.498988" in hint
    assert "required_chain=current_parcel_centroid -> analyze__find_parcels" in hint
    assert "fallback=현재 필지 컨텍스트가 없으면 사용자에게 기준 필지를 물어볼 것" in hint


def test_routing_hint_returns_none_for_plain_smalltalk():
    assert build_routing_hint([
        {"role": "user", "content": "안녕"},
    ]) is None


def test_routing_hint_address_detail_intent_uses_evaluate_buildability():
    """양재동 344-7 분석해줘 → parcel_detail chain."""
    hint = build_routing_hint([
        {"role": "user", "content": "양재동 344-7 분석해줘"},
    ])
    assert hint is not None
    assert "bucket=단일 필지 상세 검토" in hint
    assert "anchor_type=address" in hint
    assert "anchor_text=양재동 344-7" in hint
    assert "locate__search_address -> locate__get_parcel -> analyze__evaluate_buildability(pnu)" in hint
    assert "단정 금지" in hint


def test_routing_hint_address_use_hint_threads_existing_use_hint():
    """양재동 344-7 다세대 가능해? → existing_use_hint='다세대' 포함."""
    hint = build_routing_hint([
        {"role": "user", "content": "양재동 344-7 다세대 가능해?"},
    ])
    assert hint is not None
    assert "bucket=단일 필지 상세 검토" in hint
    assert 'analyze__evaluate_buildability(pnu, existing_use_hint="다세대")' in hint


def test_routing_hint_address_risk_intent_uses_risk_guard():
    """양재동 344-7 이 땅 사도 돼? → risk_check chain + 추가 확인 분리 가드."""
    hint = build_routing_hint([
        {"role": "user", "content": "양재동 344-7 이 땅 사도 돼?"},
    ])
    assert hint is not None
    assert "bucket=매수 전 리스크 체크" in hint
    assert "locate__search_address -> locate__get_parcel -> analyze__evaluate_buildability(pnu)" in hint
    assert "등기/현장/최신 건축물대장" in hint
    assert "매수 가/불가 단정 금지" in hint


def test_routing_hint_pure_address_remains_locate():
    """주소만 단독으로 — detail/risk 키워드 없으면 기존 locate hint 흐름 유지."""
    hint = build_routing_hint([
        {"role": "user", "content": "양재동 344-7"},
    ])
    assert hint is not None
    # tool_preference=locate__search_address 또는 anchor_text + tool_preference 형태
    assert "tool_preference=locate__search_address" in hint
    assert "단일 필지 상세 검토" not in hint
    assert "매수 전 리스크 체크" not in hint


def test_routing_hint_existing_buildings_unchanged():
    """기존 multifamily nearby flow는 유지."""
    hint = build_routing_hint([
        {"role": "user", "content": "양재동 344-7 근처 다세대주택"},
    ])
    assert hint is not None
    assert "bucket=기존 건축물 조회" in hint
    assert "analyze__find_existing_buildings" in hint


def test_routing_hint_address_feasibility_short_form_routes_to_detail():
    """'양재동 344-7 다세대 가능?' 같은 짧은 가능성 표현도 detail chain."""
    hint = build_routing_hint([
        {"role": "user", "content": "양재동 344-7 다세대 가능?"},
    ])
    assert hint is not None
    assert "bucket=단일 필지 상세 검토" in hint
    assert "analyze__evaluate_buildability" in hint
    assert 'existing_use_hint="다세대"' in hint


def test_routing_hint_address_build_되나():
    hint = build_routing_hint([
        {"role": "user", "content": "양재동 344-7 건축 되나?"},
    ])
    assert hint is not None
    assert "bucket=단일 필지 상세 검토" in hint
    assert "analyze__evaluate_buildability(pnu)" in hint


def test_routing_hint_address_지을_수_있어():
    hint = build_routing_hint([
        {"role": "user", "content": "양재동 344-7 지을 수 있어?"},
    ])
    assert hint is not None
    assert "bucket=단일 필지 상세 검토" in hint
    assert "analyze__evaluate_buildability" in hint


def test_routing_hint_current_parcel_detail_chain():
    """'이 필지 분석해줘' → current_parcel + evaluate_buildability."""
    hint = build_routing_hint([
        {"role": "user", "content": "이 필지 분석해줘"},
    ])
    assert hint is not None
    assert "bucket=현재 선택 필지 상세 검토" in hint
    assert "anchor_type=current_parcel" in hint
    assert "analyze__evaluate_buildability" in hint
    assert "fallback=최근 선택된 필지가 없으면" in hint


def test_routing_hint_current_parcel_feasibility_with_use_hint():
    """'이 땅 다세대 가능?' → current_parcel + existing_use_hint='다세대'."""
    hint = build_routing_hint([
        {"role": "user", "content": "이 땅 다세대 가능?"},
    ])
    assert hint is not None
    assert "anchor_type=current_parcel" in hint
    assert 'existing_use_hint="다세대"' in hint


def test_routing_hint_current_parcel_risk_separates_external_verification():
    """'이 땅 사도 돼?' → current_parcel risk_check + 등기/현장 분리."""
    hint = build_routing_hint([
        {"role": "user", "content": "이 땅 사도 돼?"},
    ])
    assert hint is not None
    assert "bucket=현재 선택 필지 매수 전 리스크 체크" in hint
    assert "anchor_type=current_parcel" in hint
    assert "analyze__evaluate_buildability" in hint
    assert "등기/현장/최신 건축물대장" in hint


def test_routing_hint_existing_stats_uses_statistics_tool():
    """multifamily nearby + 통계 → analyze__existing_building_statistics chain."""
    hint = build_routing_hint([
        {"role": "user", "content": "양재동 344-7번지 기준 반경 300m 내 다세대주택 통계치"},
    ])
    assert hint is not None
    assert "bucket=기존 건축물 통계 조회" in hint
    assert "analyze__existing_building_statistics" in hint
    # find_existing_buildings 후보 리스트 도구는 chain에서 사용되지 않아야 함.
    assert "analyze__find_existing_buildings" not in hint
    assert "후보 리스트가 아니라 통계가 본문" in hint


def test_routing_hint_existing_stats_understands_how_many_wording():
    """'얼마나 있어?'는 후보 리스트가 아니라 통계 조회로 라우팅."""
    hint = build_routing_hint([
        {"role": "user", "content": "문정동 118-15 근처에 다세대주택 얼마나 있어?"},
    ])
    assert hint is not None
    assert "bucket=기존 건축물 통계 조회" in hint
    assert "anchor_text=문정동 118-15" in hint
    assert "analyze__existing_building_statistics" in hint
    assert "probe_n=400" in hint
    assert "analyze__find_existing_buildings" not in hint


def test_routing_hint_current_parcel_stats_chain():
    """current_parcel + 주변 + 통계 의도 → existing_building_statistics chain."""
    hint = build_routing_hint([
        {"role": "user", "content": "이 필지 주변 다세대/다가구 현황"},
    ])
    assert hint is not None
    assert "bucket=기존 건축물 통계 조회" in hint
    assert "anchor_type=current_parcel" in hint
    assert "analyze__existing_building_statistics" in hint
    assert "fallback=최근 선택된 필지가 없으면" in hint


def test_routing_hint_current_parcel_nearby_without_stats_unchanged():
    """통계 키워드 없으면 기존 current_parcel nearby hint 유지."""
    hint = build_routing_hint([
        {"role": "user", "content": "이 필지 주변 인접 필지 찾아줘"},
    ])
    assert hint is not None
    assert "anchor_type=current_parcel" in hint
    assert "analyze__existing_building_statistics" not in hint


def test_routing_hint_existing_list_unchanged():
    """리스트 키워드는 find_existing_buildings 유지."""
    hint = build_routing_hint([
        {"role": "user", "content": "양재동 344-7번지 근처 다세대주택 리스트"},
    ])
    assert hint is not None
    assert "analyze__find_existing_buildings" in hint
    assert "analyze__existing_building_statistics" not in hint


def test_routing_hint_new_build_candidates_unchanged():
    """신축 후보 nearby flow는 유지."""
    hint = build_routing_hint([
        {"role": "user", "content": "양재동 344-7 근처 다세대주택 신축 후보 필지"},
    ])
    assert hint is not None
    assert "bucket=신축 후보 필지 탐색" in hint
    assert "analyze__find_parcels -> analyze__evaluate_buildability" in hint


def test_routing_hint_followup_filters_previous_existing_building_result():
    """'다세대주택만 추려봐' 같은 후속 질의는 직전 기준지/반경을 유지."""
    hint = build_routing_hint([
        {"role": "user", "content": "문정동 118-15 근처에 다세대주택 얼마나 있어?"},
        {"role": "assistant", "content": "반경 300m 내 기존 주거 건축물 통계입니다."},
        {"role": "user", "content": "다세대주택만 추려봐"},
    ])

    assert hint is not None
    assert "bucket=직전 기준 기존 건축물 필터" in hint
    assert "anchor_type=previous_context" in hint
    assert "anchor_text=문정동 118-15" in hint
    assert "use_keywords=[다세대주택]" in hint
    assert "analyze__find_existing_buildings" in hint
    assert "probe_n=400" in hint
    assert "top_n=100" in hint


def test_routing_hint_followup_visualizes_previous_filtered_result():
    """'시각화만 해봐'는 말로만 표시하지 않고 geometry 반환 도구를 재호출."""
    hint = build_routing_hint([
        {"role": "user", "content": "문정동 118-15 근처에 다세대주택 얼마나 있어?"},
        {"role": "assistant", "content": "반경 300m 내 기존 주거 건축물 통계입니다."},
        {"role": "user", "content": "다세대주택만 추려봐"},
        {"role": "assistant", "content": "다세대주택만 추리면 60개소입니다."},
        {"role": "user", "content": "아니 시각화만 해봐"},
    ])

    assert hint is not None
    assert "bucket=직전 결과 시각화" in hint
    assert "anchor_type=previous_context" in hint
    assert "anchor_text=문정동 118-15" in hint
    assert "visual_required=true" in hint
    assert "use_keywords=[다세대주택]" in hint
    assert "analyze__find_existing_buildings" in hint
    assert "probe_n=400" in hint
    assert "top_n=100" in hint
