from qwen_mcp_bridge.intent import classify_intent, extract_existing_use_hint


def _user(text: str) -> list[dict]:
    return [{"role": "user", "content": text}]


def test_address_only_is_locate_show():
    assert classify_intent(_user("쌍동리 254-7")) == "locate_show"
    assert classify_intent(_user("강남구 역삼동 738-1 위치 보여줘")) == "locate_show"


def test_address_with_detail_intent_is_parcel_detail():
    assert classify_intent(_user("양재동 344-7 분석해줘")) == "parcel_detail"
    assert classify_intent(_user("양재동 344-7 다세대 가능해?")) == "parcel_detail"
    assert classify_intent(_user("내곡동 738-1 상세 검토")) == "parcel_detail"
    assert classify_intent(_user("쌍동리 254-7 건축 가능한가")) == "parcel_detail"


def test_address_with_risk_intent_is_risk_check():
    assert classify_intent(_user("양재동 344-7 이 땅 사도 돼?")) == "risk_check"
    assert classify_intent(_user("쌍동리 254-7 매수 괜찮을까?")) == "risk_check"
    assert classify_intent(_user("이 땅 리스크 봐줘")) == "risk_check"


def test_address_with_feasibility_short_form_is_parcel_detail():
    """짧은 가능성 표현("가능?", "건축 되나?")도 parcel_detail로 잡힌다."""
    assert classify_intent(_user("양재동 344-7 다세대 가능?")) == "parcel_detail"
    assert classify_intent(_user("양재동 344-7 건축 되나?")) == "parcel_detail"
    assert classify_intent(_user("양재동 344-7 지을 수 있어?")) == "parcel_detail"
    assert classify_intent(_user("양재동 344-7 개발 가능할까?")) == "parcel_detail"
    assert classify_intent(_user("쌍동리 254-7 건축 가능한지 봐줘")) == "parcel_detail"


def test_current_parcel_feasibility_is_parcel_detail():
    """현재 선택 필지에 대한 가능성 표현도 parcel_detail."""
    assert classify_intent(_user("이 부지 건축 가능?")) == "parcel_detail"
    assert classify_intent(_user("이 땅 다세대 가능?")) == "parcel_detail"
    assert classify_intent(_user("이 필지 지을 수 있어?")) == "parcel_detail"


def test_stats_intent_for_address_with_stats_keywords():
    """주소 + multifamily + 통계 → existing_building_stats."""
    from qwen_mcp_bridge.intent import classify_intent
    cases = [
        "양재동 344-7번지 기준 반경 300m 내 다세대주택 통계치",
        "양재동 344-7 반경 300m 다세대 몇 개야?",
        "양재동 344-7 근처 주택 유형별 분포 뽑아줘",
    ]
    for q in cases:
        assert classify_intent(_user(q)) == "existing_building_stats", q


def test_list_intent_remains_existing_buildings():
    """리스트/찾기 키워드는 stats가 아니라 existing_buildings."""
    assert classify_intent(_user("양재동 344-7번지 근처 다세대주택 리스트")) == "existing_buildings"
    assert classify_intent(_user("양재동 344-7번지 근처 다세대주택 찾아줘")) == "existing_buildings"


def test_current_parcel_stats_intent():
    assert classify_intent(_user("이 필지 주변 다세대/다가구 현황")) == "existing_building_stats"


def test_extract_existing_use_hint():
    assert extract_existing_use_hint("양재동 344-7 다세대 가능해?") == "다세대"
    assert extract_existing_use_hint("이 필지 다가구 가능?") == "다가구"
    assert extract_existing_use_hint("강남구 단독주택 지을 땅") == "단독주택"
    assert extract_existing_use_hint("근린생활시설 가능해?") == "근린생활시설"
    assert extract_existing_use_hint("이 땅 분석해줘") is None


def test_address_nearby_multifamily_no_build_is_existing_buildings():
    assert classify_intent(_user("양재동 344-7 근처 다세대주택")) == "existing_buildings"


def test_address_nearby_with_build_intent_is_new_build_candidates():
    assert classify_intent(_user("양재동 344-7 근처 다세대주택 신축 후보 필지")) == "new_build_candidates"
    assert classify_intent(_user("내곡동 738-1 주변 단독주택 지을 땅")) == "new_build_candidates"


def test_facility_nearby_listing_is_nearby_context():
    assert classify_intent(_user("강남역 주변 카페 찾아줘")) == "nearby_context"


def test_facility_nearby_multifamily_is_existing_buildings():
    assert classify_intent(_user("강남구청 근처 다세대주택")) == "existing_buildings"


def test_facility_nearby_build_intent_is_new_build_candidates():
    assert classify_intent(_user("강남역 근처 신축 가능한 부지")) == "new_build_candidates"


def test_current_parcel_with_detail_is_parcel_detail():
    assert classify_intent(_user("이 필지 분석해줘")) == "parcel_detail"
    assert classify_intent(_user("이 땅 다세대 가능해?")) == "parcel_detail"


def test_current_parcel_nearby_is_nearby_context():
    # "분포" 같은 통계 키워드가 없으면 nearby_context 유지.
    assert classify_intent(_user("이 필지 주변 다세대주택")) == "nearby_context"
    # 분포/통계가 있으면 existing_building_stats로 격상됨(별 테스트에서 검증).


def test_risk_check():
    assert classify_intent(_user("이 땅 사도 돼?")) == "risk_check"
    assert classify_intent(_user("리스크 봐줘")) == "risk_check"


def test_empty_or_generic_is_general():
    assert classify_intent([]) == "general"
    assert classify_intent(_user("안녕")) == "general"
    assert classify_intent(_user("도시계획이 뭐야?")) == "general"
