from datetime import datetime

from qwen_mcp_bridge.prompts import build_system_prompt


def test_prompt_forces_get_parcel_for_address_location_display():
    prompt = build_system_prompt(datetime(2026, 5, 11))

    assert "주소·지번 위치 표시" in prompt
    assert "위치/지도/보여줘/표시" in prompt
    assert "locate__search_address" in prompt
    assert "locate__get_parcel" in prompt
    assert "search_address 결과만으로 답변을 끝내지 말 것" in prompt


def test_prompt_forces_address_origin_for_nearby_multifamily_queries():
    prompt = build_system_prompt(datetime(2026, 5, 11))

    assert "주소·지번 주변 분석" in prompt
    assert "양재동 344-7번지" in prompt
    assert "양재역" in prompt
    assert "절대 `locate__search_facility`로 바꾸지 말 것" in prompt
    assert "`locate__search_address` → `locate__get_parcel` → `analyze__find_parcels`" in prompt
    assert "기준 필지 geometry의 중심점" in prompt
    assert "반경 언급이 없으면 기본 300m" in prompt


def test_prompt_distinguishes_existing_multifamily_list_from_new_build_candidates():
    prompt = build_system_prompt(datetime(2026, 5, 11))

    assert "다세대주택 리스트" in prompt
    assert "기존 건축물 조회" in prompt
    assert "신축/건축/개발/부지/필지" in prompt
    assert "신축 후보 필지 탐색" in prompt
    assert "용도지역만으로 건축 가능 단정 금지" in prompt
