"""사용자 발화 → 의도 라벨 분류.

`query_policy.py`가 만들던 bucket 문자열을 1급 enum-like literal로 격상.
시각화 분기·시나리오 테스트·SSE 메타 이벤트 모두 이 라벨을 1차 키로 쓴다.
"""
from __future__ import annotations

import re
from typing import Any, Literal

from qwen_mcp_bridge.query_policy import (
    _BUILD_CANDIDATE_RE,
    _CURRENT_PARCEL_RE,
    _DETAIL_RE as _QP_DETAIL_RE,
    _DISPLAY_RE,
    _FEASIBILITY_RE,
    _LIST_RE,
    _MULTIFAMILY_RE,
    _NEARBY_RE,
    _RISK_RE as _QP_RISK_RE,
    _extract_address_anchor,
    _extract_facility_anchor,
    _last_user_text,
)

IntentLabel = Literal[
    "locate_show",          # 위치/지도 표시
    "existing_buildings",   # 주변 기존 건축물 조회 (다세대·다가구 등)
    "new_build_candidates", # 신축 후보 필지 탐색
    "parcel_detail",        # 단일 필지 상세 검토
    "risk_check",           # 매수 전 리스크 체크
    "nearby_context",       # 주변 입지·도달권·POI
    "general",              # 위 어디에도 매핑되지 않는 일반 질의
]

ALL_INTENTS: tuple[IntentLabel, ...] = (
    "locate_show",
    "existing_buildings",
    "new_build_candidates",
    "parcel_detail",
    "risk_check",
    "nearby_context",
    "general",
)

# query_policy와 동기 유지 — 단일 source of truth는 query_policy 모듈.
_RISK_RE = _QP_RISK_RE
# 단일 필지 상세/가능성 의도 — DETAIL + FEASIBILITY 결합.
_DETAIL_OR_FEASIBILITY_RE = re.compile(
    f"(?:{_QP_DETAIL_RE.pattern})|(?:{_FEASIBILITY_RE.pattern})"
)
_DETAIL_RE = _DETAIL_OR_FEASIBILITY_RE  # 하위 호환 alias
# "다세대 가능?" "근생 가능해?" 같이 building 용도 의도 표현 — evaluate_buildability의
# existing_use_hint 파라미터 추출에 쓰임. classify_intent 자체에는 영향 없음.
_USE_HINT_RES: tuple[tuple[str, re.Pattern], ...] = (
    ("다세대", re.compile(r"다세대")),
    ("다가구", re.compile(r"다가구")),
    ("공동주택", re.compile(r"공동주택")),
    ("연립주택", re.compile(r"연립")),
    ("단독주택", re.compile(r"단독주택|단독\s*주거")),
    ("근린생활시설", re.compile(r"근린생활|근생")),
    ("주차장", re.compile(r"주차장")),
)


def extract_existing_use_hint(text: str) -> str | None:
    """발화에서 evaluate_buildability에 넘길 existing_use_hint를 1개 추출 (없으면 None)."""
    for hint, pattern in _USE_HINT_RES:
        if pattern.search(text):
            return hint
    return None


def classify_intent(messages: list[dict[str, Any]]) -> IntentLabel:
    """최근 user 발화 1건을 의도 라벨 1개로 매핑.

    우선순위:
    1. risk_check (명시적 "사도 돼/리스크")
    2. parcel_detail ("이 필지/이 땅" + 분석 의도)
    3. address anchor 기준 분기 (nearby vs display)
    4. facility anchor 기준 분기
    5. fallback: general
    """
    text = _last_user_text(messages)
    if not text:
        return "general"

    if _RISK_RE.search(text):
        return "risk_check"

    is_current_parcel = bool(_CURRENT_PARCEL_RE.search(text))
    if is_current_parcel and _DETAIL_RE.search(text) and not _NEARBY_RE.search(text):
        # "주변"이 있으면 nearby_context로 — parcel_detail은 단일 필지 자체 분석에 한정.
        return "parcel_detail"

    address = _extract_address_anchor(text)
    if address:
        if _NEARBY_RE.search(text):
            if _BUILD_CANDIDATE_RE.search(text):
                return "new_build_candidates"
            if _MULTIFAMILY_RE.search(text):
                return "existing_buildings"
            return "nearby_context"
        # 주소 anchor 있고 nearby 없을 때:
        # "분석/상세/검토/가능해" 등 분석 의도가 있으면 parcel_detail (locate_show가 아님).
        if _DETAIL_RE.search(text):
            return "parcel_detail"
        if _DISPLAY_RE.search(text):
            return "locate_show"
        # 주소만 단독 — 위치 보여달라는 의도와 동의어로 처리.
        return "locate_show"

    if is_current_parcel and _NEARBY_RE.search(text):
        return "nearby_context"

    facility = _extract_facility_anchor(text)
    if facility and _NEARBY_RE.search(text):
        if _BUILD_CANDIDATE_RE.search(text):
            return "new_build_candidates"
        if _MULTIFAMILY_RE.search(text):
            return "existing_buildings"
        if _LIST_RE.search(text):
            return "nearby_context"
        return "nearby_context"

    return "general"
