"""Lightweight natural-language routing hints for urban queries."""
from __future__ import annotations

import re
from typing import Any


_JIBUN_RE = re.compile(
    r"(?P<anchor>(?:(?:[가-힣]+(?:특별시|광역시|도|시|군|구|읍|면)\s+)*)"
    r"[가-힣0-9]+(?:동|리|가)\s*\d+(?:-\d+)?\s*(?:번지)?)"
)
_ROAD_RE = re.compile(
    r"(?P<anchor>(?:(?:[가-힣]+(?:특별시|광역시|도|시|군|구|읍|면)\s+)*)"
    r"[가-힣0-9]+(?:로|길)\s*\d+(?:-\d+)?)"
)
_FACILITY_RE = re.compile(
    r"(?P<anchor>[가-힣A-Za-z0-9·().-]+"
    r"(?:역|구청|시청|군청|도청|공항|터미널|대학교|대학|학교|병원|백화점|마트|공원|시장|센터|타워|빌딩|점))"
)
_PYUNG_RE = re.compile(r"(?P<pyung>\d+(?:\.\d+)?)\s*평")

_NEARBY_RE = re.compile(r"근처|주변|인근|반경|도보")
_LIST_RE = re.compile(r"찾|리스트|목록|후보|모아|골라|추려|필지|땅|부지")
_DISPLAY_RE = re.compile(r"위치|지도|보여|표시|가리켜|어딘지")
_MULTIFAMILY_RE = re.compile(r"다세대|다가구|공동주택|연립")
_BUILD_CANDIDATE_RE = re.compile(r"신축|건축|개발|매수|부지|필지|나대지|땅|짓|지을|가능|후보지")
_CURRENT_PARCEL_RE = re.compile(r"(?:이|현재|선택(?:한|된)?)\s*(?:필지|부지|땅)|여기")
_RADIUS_M_RE = re.compile(r"(?P<radius>\d{2,4}(?:\.\d+)?)\s*(?:m|미터)")
_RADIUS_KM_RE = re.compile(r"(?P<radius>\d(?:\.\d+)?)\s*(?:km|킬로)")
_VISUALIZE_FOLLOWUP_RE = re.compile(r"시각화|지도|마커|표시|띄워|그려")
_FOLLOWUP_FILTER_ACTION_RE = re.compile(r"만|추려|필터|골라|보여|표시|목록|리스트|시각화|지도")
_USE_FILTER_RE = re.compile(r"다세대주택|다세대|다가구주택|다가구|공동주택|연립주택|연립")
# 통계/분포/현황 의도 — existing_building_stats 분기 트리거.
_STATS_RE = re.compile(
    r"통계치|통계|분포|현황|"
    r"몇\s*개|몇\s*곳|몇\s*동|몇\s*필지|개수|"
    r"비율|비중|"
    r"집계|요약|"
    r"평균|중앙값|합계|총\s*몇|총량|수량|카운트|"
    r"얼마나(?:\s*있|야|인가|인지)?|"
    r"밀도|구성"
)

# 단일 필지 상세 검토 / 매수 리스크 / 가능성 표현 — intent.py와 동기 유지.
_DETAIL_RE = re.compile(r"분석|상세|검토|어떤\s*땅|이\s*땅|이\s*필지|이\s*부지")
# 가능성 표현 — DETAIL과 동일 흐름(parcel_detail / address_detail_hint)으로 묶음.
_FEASIBILITY_RE = re.compile(
    r"가능해|가능[\?？]|가능한지|가능한가|가능할까|가능합니까|"
    r"되나[\?？]?|될까[\?？]?|되는지|되는가|"
    r"지을\s*수|짓\s*을\s*수|"
    r"건축\s*되나|건축\s*가능|개발\s*가능|신축\s*가능"
)
_RISK_RE = re.compile(r"리스크|위험|사도\s*돼|매수.*괜찮|살까|매입.*괜찮|매수.*안전")


def build_routing_hint(messages: list[dict[str, Any]]) -> str | None:
    """Return a compact system hint for the latest user query.

    The hint does not call tools. It only gives the model deterministic anchor
    precedence so explicit parcel/address queries do not drift into facility
    search, while station/facility queries still use facility search.
    """
    text = _last_user_text(messages)
    if not text:
        return None

    address = _extract_address_anchor(text)
    if address:
        # risk · detail은 nearby보다 우선 — 단, "근처/주변"이 함께 있으면 nearby로 양보.
        if _RISK_RE.search(text) and not _NEARBY_RE.search(text):
            return _address_risk_hint(text, address)
        if (_DETAIL_RE.search(text) or _FEASIBILITY_RE.search(text)) and not _NEARBY_RE.search(text):
            return _address_detail_hint(text, address)
        if _NEARBY_RE.search(text):
            return _address_nearby_hint(text, address)
        if _DISPLAY_RE.search(text):
            return _address_display_hint(address)
        return _address_anchor_hint(address)

    # address 없이도 current_parcel 분기 — risk/detail이 nearby보다 우선.
    if _CURRENT_PARCEL_RE.search(text):
        if _RISK_RE.search(text):
            return _current_parcel_risk_hint(text)
        if _DETAIL_RE.search(text) or _FEASIBILITY_RE.search(text):
            if not _NEARBY_RE.search(text):
                return _current_parcel_detail_hint(text)

    if _CURRENT_PARCEL_RE.search(text) and _NEARBY_RE.search(text):
        # 통계 의도면 stats hint, 아니면 기본 current_parcel nearby hint.
        if _STATS_RE.search(text):
            return _current_parcel_stats_hint(text)
        return _current_parcel_hint()

    use_filter = _extract_existing_use_filter(text)
    if use_filter and _previous_existing_context(messages):
        return _previous_existing_filter_hint(messages, use_filter)

    if _is_visualize_followup(text) and _previous_existing_context(messages):
        previous_use = _previous_existing_use_filter(messages) or ["다세대주택", "다가구주택", "공동주택", "연립주택"]
        return _previous_existing_visualization_hint(messages, previous_use)

    facility = _extract_facility_anchor(text)
    if facility:
        if _NEARBY_RE.search(text) and _LIST_RE.search(text):
            return _facility_nearby_hint(text, facility)
        return _facility_anchor_hint(facility)

    return None


def _last_user_text(messages: list[dict[str, Any]]) -> str:
    for message in reversed(messages):
        if message.get("role") != "user":
            continue
        content = message.get("content") or ""
        if isinstance(content, str):
            return content.strip()
    return ""


def _messages_before_latest_user(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for idx in range(len(messages) - 1, -1, -1):
        if messages[idx].get("role") == "user":
            return messages[:idx]
    return []


def _extract_address_anchor(text: str) -> str | None:
    for pattern in (_JIBUN_RE, _ROAD_RE):
        match = pattern.search(text)
        if match:
            return _clean_anchor(match.group("anchor"))
    return None


def _extract_facility_anchor(text: str) -> str | None:
    match = _FACILITY_RE.search(text)
    if not match:
        return None
    return _clean_anchor(match.group("anchor"))


def _clean_anchor(anchor: str) -> str:
    return re.sub(r"\s+", " ", anchor).strip()


def _canonical_existing_use(value: str) -> str:
    if "다세대" in value:
        return "다세대주택"
    if "다가구" in value:
        return "다가구주택"
    if "연립" in value:
        return "연립주택"
    if "공동" in value:
        return "공동주택"
    return value


def _extract_existing_use_filter(text: str, *, allow_plain: bool = False) -> list[str] | None:
    match = _USE_FILTER_RE.search(text)
    if not match:
        return None
    if not allow_plain and not _FOLLOWUP_FILTER_ACTION_RE.search(text):
        return None
    return [_canonical_existing_use(match.group(0))]


def _is_visualize_followup(text: str) -> bool:
    return bool(_VISUALIZE_FOLLOWUP_RE.search(text))


def _has_previous_existing_context(messages: list[dict[str, Any]]) -> bool:
    return _previous_existing_context(messages) is not None


def _previous_existing_context(messages: list[dict[str, Any]]) -> dict[str, str] | None:
    previous = _messages_before_latest_user(messages)
    if not previous:
        return None

    anchor_type = ""
    anchor_text = ""
    for message in reversed(previous):
        if message.get("role") != "user":
            continue
        content = message.get("content") or ""
        if not isinstance(content, str):
            continue
        address = _extract_address_anchor(content)
        if address:
            anchor_type = "address"
            anchor_text = address
            break
        facility = _extract_facility_anchor(content)
        if facility:
            anchor_type = "facility"
            anchor_text = facility
            break

    if not anchor_text:
        return None

    previous_text = "\n".join(
        m.get("content") or ""
        for m in previous
        if isinstance(m.get("content"), str)
    )
    if not (
        _MULTIFAMILY_RE.search(previous_text)
        or "기존 건축물" in previous_text
        or "matched_buildings" in previous_text
        or "use_counts" in previous_text
    ):
        return None

    return {
        "anchor_type": anchor_type,
        "anchor_text": anchor_text,
        "radius": _previous_radius(previous_text) or "300",
    }


def _previous_radius(text: str) -> str | None:
    km_match = _RADIUS_KM_RE.search(text)
    if km_match:
        return str(int(float(km_match.group("radius")) * 1000))
    m_match = _RADIUS_M_RE.search(text)
    if m_match:
        return str(int(float(m_match.group("radius"))))
    return None


def _previous_existing_use_filter(messages: list[dict[str, Any]]) -> list[str] | None:
    for message in reversed(_messages_before_latest_user(messages)):
        content = message.get("content") or ""
        if not isinstance(content, str):
            continue
        uses = _extract_existing_use_filter(content, allow_plain=True)
        if uses:
            return uses
    return None


def _format_use_keywords(uses: list[str]) -> str:
    return "[" + ",".join(uses) + "]"


def _routing_header() -> list[str]:
    return [
        "### 브릿지 라우팅 힌트",
        "이번 힌트는 사용자 발화에서 확정 가능한 anchor와 tool chain만 고정한다.",
    ]


def _address_nearby_hint(text: str, address: str) -> str:
    if _is_existing_multifamily_search(text) and _STATS_RE.search(text):
        return _existing_stats_hint(text, "address", address, "300")
    if _is_existing_multifamily_search(text):
        return _existing_multifamily_address_hint(text, address)

    build_intent = _is_build_candidate_search(text)
    base_chain = "locate__search_address -> locate__get_parcel -> analyze__find_parcels"
    chain = (
        f"{base_chain} -> analyze__evaluate_buildability(상위 3-5개 후보 PNU)"
        if build_intent else base_chain
    )
    lines = [
        *_routing_header(),
        f"bucket={'신축 후보 필지 탐색' if build_intent else '조건 맞는 땅 찾아줘'}",
        "anchor_type=address",
        f"anchor_text={address}",
        "locate__search_facility 금지: 지번/번지/도로명 주소가 명시됐으므로 역명·시설명으로 보정하지 말 것.",
        f"required_chain={chain}",
        "find_parcels_origin=locate__get_parcel geometry 중심점 또는 bbox 중심",
        "radius_m=300",
    ]
    lines.extend(_area_lines(text))
    if build_intent:
        lines.append("post_filter=건축 의도 있음; evaluate_buildability가 결정한 state 라벨 그대로 인용 (단정 금지)")
        lines.append("answer_guard=용도지역만으로 건축 가능 단정 금지")
    return "\n".join(lines)


def _existing_stats_hint(text: str, anchor_type: str, anchor_text: str, radius: str) -> str:
    """existing_building_stats — 후보 리스트 대신 통계 도구를 호출."""
    if anchor_type == "address":
        chain = (
            "locate__search_address -> locate__get_parcel -> "
            f"analyze__existing_building_statistics(lng, lat, radius_m={radius}, "
            "use_keywords=[다세대주택,다가구주택,공동주택,연립주택], probe_n=400, examples_n=5)"
        )
    else:
        chain = (
            "locate__search_facility -> "
            f"analyze__existing_building_statistics(lng, lat, radius_m={radius}, "
            "use_keywords=[다세대주택,다가구주택,공동주택,연립주택], probe_n=400, examples_n=5)"
        )
    lines = [
        *_routing_header(),
        "bucket=기존 건축물 통계 조회",
        f"anchor_type={anchor_type}",
        f"anchor_text={anchor_text}",
        f"required_chain={chain}",
        f"radius_m={radius}",
        "visual_suppress=intermediate_parcel_candidates",
        "answer_mode=use_counts 표 + matched_buildings 합계 + coverage/probe_n + area_stats(평균·중앙값) + examples 3-5건 (후보 6개 리스트로 답하지 말 것)",
        "answer_guard=후보 리스트가 아니라 통계가 본문. examples는 참고용 부록.",
    ]
    lines.extend(_area_lines(text))
    return "\n".join(lines)


def _existing_multifamily_address_hint(text: str, address: str) -> str:
    lines = [
        *_routing_header(),
        "bucket=기존 건축물 조회",
        "anchor_type=address",
        f"anchor_text={address}",
        "existing_use=다세대주택",
        "locate__search_facility 금지: 지번/번지/도로명 주소가 명시됐으므로 역명·시설명으로 보정하지 말 것.",
        "required_chain=locate__search_address -> locate__get_parcel -> analyze__find_existing_buildings(lng, lat, radius_m, use_keywords=[다세대주택,다가구주택,공동주택,연립주택], probe_n=400, top_n=100)",
        "find_existing_origin=locate__get_parcel geometry 중심점 또는 bbox 중심",
        "radius_m=300",
        "visual_suppress=intermediate_parcel_candidates",
        "answer_guard=find_existing_buildings 결과 features의 state=confirmed_existing_building 항목만 답변 카드로 사용. raw 추측 금지.",
    ]
    lines.extend(_area_lines(text))
    return "\n".join(lines)


def _address_display_hint(address: str) -> str:
    return "\n".join([
        *_routing_header(),
        "bucket=여기 뭐야",
        "anchor_type=address",
        f"anchor_text={address}",
        "required_chain=locate__search_address -> locate__get_parcel",
        "answer_mode=locate__get_parcel geometry가 지도에 표시되므로 search_address 결과만으로 끝내지 말 것",
    ])


def _address_anchor_hint(address: str) -> str:
    return "\n".join([
        *_routing_header(),
        "anchor_type=address",
        f"anchor_text={address}",
        "tool_preference=locate__search_address",
        "locate__search_facility 금지: 명시 주소·지번을 시설명으로 보정하지 말 것.",
    ])


def _build_evaluate_call(text: str) -> str:
    """텍스트에서 use_hint를 추출해 evaluate_buildability 호출 시그니처 생성."""
    # 지연 import — query_policy ↔ intent 순환 회피.
    from qwen_mcp_bridge.intent import extract_existing_use_hint
    hint = extract_existing_use_hint(text)
    if hint:
        return f'analyze__evaluate_buildability(pnu, existing_use_hint="{hint}")'
    return "analyze__evaluate_buildability(pnu)"


def _address_detail_hint(text: str, address: str) -> str:
    """단일 주소 + 상세/가능성 의도 — search_address → get_parcel → evaluate_buildability chain."""
    chain = f"locate__search_address -> locate__get_parcel -> {_build_evaluate_call(text)}"
    return "\n".join([
        *_routing_header(),
        "bucket=단일 필지 상세 검토",
        "anchor_type=address",
        f"anchor_text={address}",
        "locate__search_facility 금지: 지번/번지/도로명 주소가 명시됐으므로 역명·시설명으로 보정하지 말 것.",
        f"required_chain={chain}",
        "answer_guard=evaluate_buildability가 결정한 state·state_reason을 그대로 인용. 용도지역·지목만으로 '건축 가능' 단정 금지.",
        "answer_mode=판단 상태(1차 후보/부적합/추가 확인 필요 등) + 평가 사유 3-5개 한 줄씩 + 확인 안 된 항목(현장·등기·건축물대장) 분리 표시.",
    ])


def _address_risk_hint(text: str, address: str) -> str:
    """단일 주소 + 리스크/매수 의도 — detail과 동일 chain + 리스크 가드."""
    chain = f"locate__search_address -> locate__get_parcel -> {_build_evaluate_call(text)}"
    return "\n".join([
        *_routing_header(),
        "bucket=매수 전 리스크 체크",
        "anchor_type=address",
        f"anchor_text={address}",
        "locate__search_facility 금지: 지번/번지/도로명 주소가 명시됐으므로 역명·시설명으로 보정하지 말 것.",
        f"required_chain={chain}",
        "answer_guard=공공데이터 기반 1차 리스크만 말하고, 등기/현장/최신 건축물대장은 '추가 확인 필요'로 분리. 매수 가/불가 단정 금지.",
        "answer_mode=확인된 리스크(지목·용도지역·도로·기존 건축물) + 추가 확인 필요 항목(등기·현장·최신 건축물대장)을 분리해서 표시.",
    ])


def _facility_nearby_hint(text: str, facility: str) -> str:
    radius = "300" if facility.endswith("역") else "500"
    if _is_existing_multifamily_search(text) and _STATS_RE.search(text):
        return _existing_stats_hint(text, "facility", facility, radius)
    if _is_existing_multifamily_search(text):
        lines = [
            *_routing_header(),
            "bucket=기존 건축물 조회",
            "anchor_type=facility",
            f"anchor_text={facility}",
            "existing_use=다세대주택",
            "required_chain=locate__search_facility -> analyze__find_existing_buildings(lng, lat, radius_m, use_keywords=[다세대주택,다가구주택,공동주택,연립주택], probe_n=400, top_n=100)",
            f"radius_m={radius}",
            "visual_suppress=intermediate_parcel_candidates",
            "answer_guard=find_existing_buildings 결과 features의 state=confirmed_existing_building 항목만 답변 카드로 사용",
        ]
        lines.extend(_area_lines(text))
        return "\n".join(lines)

    build_intent = _is_build_candidate_search(text)
    base_chain = "locate__search_facility -> analyze__find_parcels"
    chain = (
        f"{base_chain} -> analyze__evaluate_buildability(상위 3-5개 후보 PNU)"
        if build_intent else base_chain
    )
    lines = [
        *_routing_header(),
        f"bucket={'신축 후보 필지 탐색' if build_intent else '조건 맞는 땅 찾아줘'}",
        "anchor_type=facility",
        f"anchor_text={facility}",
        f"required_chain={chain}",
        f"radius_m={radius}",
    ]
    lines.extend(_area_lines(text))
    if build_intent:
        lines.append("post_filter=건축 의도 있음; evaluate_buildability가 결정한 state 라벨 그대로 인용")
        lines.append("answer_guard=용도지역만으로 건축 가능 단정 금지")
    return "\n".join(lines)


def _facility_anchor_hint(facility: str) -> str:
    return "\n".join([
        *_routing_header(),
        "anchor_type=facility",
        f"anchor_text={facility}",
        "tool_preference=locate__search_facility",
    ])


def _current_parcel_detail_hint(text: str) -> str:
    """현재 선택 필지 + 분석/가능성 — evaluate_buildability chain."""
    chain = (
        "최근 선택된 필지/카드/locate__get_parcel 결과의 pnu -> "
        + _build_evaluate_call(text)
    )
    return "\n".join([
        *_routing_header(),
        "bucket=현재 선택 필지 상세 검토",
        "anchor_type=current_parcel",
        "anchor_text=최근 선택된 필지 또는 직전 필지 도구 결과",
        f"required_chain={chain}",
        "fallback=최근 선택된 필지가 없으면 사용자에게 기준 필지를 물어볼 것",
        "answer_guard=evaluate_buildability가 결정한 state·state_reason 그대로 인용. 용도지역·지목만으로 '건축 가능' 단정 금지.",
        "answer_mode=판단 상태 + 평가 사유 3-5개 + 확인 안 된 항목(현장·등기·건축물대장) 분리 표시.",
    ])


def _current_parcel_risk_hint(text: str) -> str:
    """현재 선택 필지 + 리스크/매수 — evaluate_buildability chain + 외부 확인 분리."""
    chain = (
        "최근 선택된 필지/카드/locate__get_parcel 결과의 pnu -> "
        + _build_evaluate_call(text)
    )
    return "\n".join([
        *_routing_header(),
        "bucket=현재 선택 필지 매수 전 리스크 체크",
        "anchor_type=current_parcel",
        "anchor_text=최근 선택된 필지 또는 직전 필지 도구 결과",
        f"required_chain={chain}",
        "fallback=최근 선택된 필지가 없으면 사용자에게 기준 필지를 물어볼 것",
        "answer_guard=공공데이터 기반 1차 리스크만 말하고, 등기/현장/최신 건축물대장은 '추가 확인 필요'로 분리. 매수 가/불가 단정 금지.",
        "answer_mode=확인된 리스크(지목·용도지역·도로·기존 건축물) + 추가 확인 필요 항목(등기·현장·최신 건축물대장)을 분리 표시.",
    ])


def _current_parcel_stats_hint(text: str) -> str:
    """현재 선택 필지 + 주변 + 통계 — existing_building_statistics chain.

    chain: 최근 선택 필지의 geometry 중심점 → analyze__existing_building_statistics.
    """
    chain = (
        "최근 선택된 필지/카드/locate__get_parcel 결과의 geometry 중심점 -> "
        "analyze__existing_building_statistics(lng, lat, radius_m=300, "
        "use_keywords=[다세대주택,다가구주택,공동주택,연립주택], probe_n=400, examples_n=5)"
    )
    lines = [
        *_routing_header(),
        "bucket=기존 건축물 통계 조회",
        "anchor_type=current_parcel",
        "anchor_text=최근 선택된 필지 또는 직전 필지 도구 결과",
        f"required_chain={chain}",
        "fallback=최근 선택된 필지가 없으면 사용자에게 기준 필지를 물어볼 것",
        "radius_m=300",
        "visual_suppress=intermediate_parcel_candidates",
        "answer_mode=use_counts 표 + matched_buildings 합계 + coverage/probe_n + area_stats(평균·중앙값) + examples 3-5건 (후보 리스트로 답하지 말 것)",
        "answer_guard=후보 리스트가 아니라 통계가 본문. examples는 참고용 부록.",
    ]
    lines.extend(_area_lines(text))
    return "\n".join(lines)


def _previous_existing_filter_hint(messages: list[dict[str, Any]], uses: list[str]) -> str:
    context = _previous_existing_context(messages)
    if context is None:
        return ""
    use_keywords = _format_use_keywords(uses)
    if context["anchor_type"] == "address":
        chain = (
            f"직전 기준지/반경 유지 -> locate__search_address({context['anchor_text']}) -> "
            f"locate__get_parcel -> analyze__find_existing_buildings(lng, lat, radius_m={context['radius']}, "
            f"use_keywords={use_keywords}, probe_n=400, top_n=100)"
        )
    else:
        chain = (
            f"직전 기준지/반경 유지 -> locate__search_facility({context['anchor_text']}) -> "
            f"analyze__find_existing_buildings(lng, lat, radius_m={context['radius']}, "
            f"use_keywords={use_keywords}, probe_n=400, top_n=100)"
        )
    return "\n".join([
        *_routing_header(),
        "bucket=직전 기준 기존 건축물 필터",
        "anchor_type=previous_context",
        f"anchor_text={context['anchor_text']}",
        f"radius_m={context['radius']}",
        f"use_keywords={use_keywords}",
        f"required_chain={chain}",
        "visual_suppress=intermediate_parcel_candidates",
        "answer_mode=직전 결과를 말로 재가공하지 말고 같은 기준지/반경에서 선택 용도만 재조회. total과 features를 함께 사용.",
        "answer_guard=find_existing_buildings 결과 features의 state=confirmed_existing_building 항목만 답변/카드/지도에 사용.",
    ])


def _previous_existing_visualization_hint(messages: list[dict[str, Any]], uses: list[str]) -> str:
    context = _previous_existing_context(messages)
    if context is None:
        return ""
    use_keywords = _format_use_keywords(uses)
    if context["anchor_type"] == "address":
        chain = (
            f"직전 기준지/반경/필터 유지 -> locate__search_address({context['anchor_text']}) -> "
            f"locate__get_parcel -> analyze__find_existing_buildings(lng, lat, radius_m={context['radius']}, "
            f"use_keywords={use_keywords}, probe_n=400, top_n=100)"
        )
    else:
        chain = (
            f"직전 기준지/반경/필터 유지 -> locate__search_facility({context['anchor_text']}) -> "
            f"analyze__find_existing_buildings(lng, lat, radius_m={context['radius']}, "
            f"use_keywords={use_keywords}, probe_n=400, top_n=100)"
        )
    return "\n".join([
        *_routing_header(),
        "bucket=직전 결과 시각화",
        "anchor_type=previous_context",
        f"anchor_text={context['anchor_text']}",
        f"radius_m={context['radius']}",
        f"use_keywords={use_keywords}",
        f"required_chain={chain}",
        "visual_required=true",
        "visual_suppress=intermediate_parcel_candidates",
        "answer_mode=짧게 표시 대상 수만 말하고, find_existing_buildings FeatureCollection이 지도에 렌더되게 할 것.",
        "answer_guard='지도에 표시했다'고 말만 하지 말고 geometry가 있는 features를 반환하는 도구를 반드시 호출.",
    ])


def _current_parcel_hint() -> str:
    return "\n".join([
        *_routing_header(),
        "anchor_type=current_parcel",
        "anchor_text=최근 선택된 필지 또는 직전 필지 도구 결과",
        "routing=최근 선택된 필지/카드/locate__get_parcel 결과가 있으면 그 geometry를 기준으로 주변 분석",
        "fallback=최근 선택된 필지가 없으면 사용자에게 기준 필지를 물어볼 것",
    ])


def _area_lines(text: str) -> list[str]:
    match = _PYUNG_RE.search(text)
    if not match:
        return []
    pyung_text = match.group("pyung")
    pyung = float(pyung_text)
    sqm = pyung * 3.3058
    return [
        f"area_hint={pyung_text}평 ~= {sqm:.0f}m2",
        f"area_min_m2={sqm * 0.85:.0f}",
        f"area_max_m2={sqm * 1.15:.0f}",
    ]


def _is_existing_multifamily_search(text: str) -> bool:
    return bool(_MULTIFAMILY_RE.search(text)) and not _is_build_candidate_search(text)


def _is_build_candidate_search(text: str) -> bool:
    return bool(_BUILD_CANDIDATE_RE.search(text))
