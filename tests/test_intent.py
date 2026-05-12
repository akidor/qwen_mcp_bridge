from qwen_mcp_bridge.intent import classify_intent


def _user(text: str) -> list[dict]:
    return [{"role": "user", "content": text}]


def test_address_only_is_locate_show():
    assert classify_intent(_user("쌍동리 254-7")) == "locate_show"
    assert classify_intent(_user("강남구 역삼동 738-1 위치 보여줘")) == "locate_show"


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
    assert classify_intent(_user("이 필지 주변 다세대 분포")) == "nearby_context"


def test_risk_check():
    assert classify_intent(_user("이 땅 사도 돼?")) == "risk_check"
    assert classify_intent(_user("리스크 봐줘")) == "risk_check"


def test_empty_or_generic_is_general():
    assert classify_intent([]) == "general"
    assert classify_intent(_user("안녕")) == "general"
    assert classify_intent(_user("도시계획이 뭐야?")) == "general"
