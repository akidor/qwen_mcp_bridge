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
_BUILD_INTENT_RE = re.compile(r"다세대|다가구|주택|신축|건축|개발|매수|부지|나대지")
_CURRENT_PARCEL_RE = re.compile(r"(?:이|현재|선택(?:한|된)?)\s*(?:필지|부지|땅)|여기")


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
        if _NEARBY_RE.search(text):
            return _address_nearby_hint(text, address)
        if _DISPLAY_RE.search(text):
            return _address_display_hint(address)
        return _address_anchor_hint(address)

    if _CURRENT_PARCEL_RE.search(text) and _NEARBY_RE.search(text):
        return _current_parcel_hint()

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


def _routing_header() -> list[str]:
    return [
        "### 브릿지 라우팅 힌트",
        "이번 힌트는 사용자 발화에서 확정 가능한 anchor와 tool chain만 고정한다.",
    ]


def _address_nearby_hint(text: str, address: str) -> str:
    lines = [
        *_routing_header(),
        "bucket=조건 맞는 땅 찾아줘",
        "anchor_type=address",
        f"anchor_text={address}",
        "locate__search_facility 금지: 지번/번지/도로명 주소가 명시됐으므로 역명·시설명으로 보정하지 말 것.",
        "required_chain=locate__search_address -> locate__get_parcel -> analyze__find_parcels",
        "find_parcels_origin=locate__get_parcel geometry 중심점 또는 bbox 중심",
        "radius_m=300",
    ]
    lines.extend(_area_lines(text))
    if _BUILD_INTENT_RE.search(text):
        lines.append("post_filter=건축 의도 있음; 지목·용도지역 기준으로 건축 가능 후보를 우선 추천")
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


def _facility_nearby_hint(text: str, facility: str) -> str:
    radius = "300" if facility.endswith("역") else "500"
    lines = [
        *_routing_header(),
        "bucket=조건 맞는 땅 찾아줘",
        "anchor_type=facility",
        f"anchor_text={facility}",
        "required_chain=locate__search_facility -> analyze__find_parcels",
        f"radius_m={radius}",
    ]
    lines.extend(_area_lines(text))
    if _BUILD_INTENT_RE.search(text):
        lines.append("post_filter=건축 의도 있음; 지목·용도지역 기준으로 건축 가능 후보를 우선 추천")
    return "\n".join(lines)


def _facility_anchor_hint(facility: str) -> str:
    return "\n".join([
        *_routing_header(),
        "anchor_type=facility",
        f"anchor_text={facility}",
        "tool_preference=locate__search_facility",
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
