"""Filters applied only to frontend visualization payloads."""
from __future__ import annotations

import copy
import json
import re
from collections import Counter
from typing import Any


BUILDABLE_VISUAL_TOOLS = {"analyze__find_parcels", "locate__parcels_in_boundary"}
NON_BUILDABLE_JIMOK = {
    "도", "도로",
    "천", "하천",
    "구", "구거",
    "유", "유지",
    "제", "제방",
    "수", "수도용지",
    "공", "공원",
    "체", "체육용지",
    "운", "운동장",
    "광", "광천지",
    "양", "양어장",
    "묘", "묘지",
    "사", "사적지",
    "종", "종교용지",
}
DIFFICULT_JIMOK = {"전", "답", "과", "과수원", "목", "목장용지", "임", "임야"}
BUILDABLE_JIMOK = {"대", "대지", "잡", "잡종지"}
BUILD_INTENT_RE = re.compile(r"다세대|다가구|주택|신축|건축|개발|매수|부지|나대지")
RESTRICTED_ZONE_KEYWORDS = (
    "자연녹지지역",
    "보전녹지지역",
    "보전관리지역",
    "보전산지",
    "공원녹지",
)


def should_filter_buildable_visual_result(tool_name: str, messages: list[dict[str, Any]]) -> bool:
    if tool_name not in BUILDABLE_VISUAL_TOOLS:
        return False
    marker = "post_filter=건축 의도 있음"
    for message in messages:
        content = message.get("content")
        if isinstance(content, str) and marker in content:
            return True
        if message.get("role") == "user" and isinstance(content, str) and BUILD_INTENT_RE.search(content):
            return True
    return False


def filter_buildable_candidate_result(raw_text: str) -> str:
    """Remove clearly non-buildable parcel features from frontend GeoJSON payload.

    This is intentionally visualization-only. The model still receives the raw
    tool result so it can explain how many candidates were excluded and why.
    """
    try:
        raw = json.loads(raw_text)
    except json.JSONDecodeError:
        return raw_text

    filtered = copy.deepcopy(raw)
    target = _feature_container(filtered)
    if target is None:
        return raw_text

    features = target.get("features")
    if not isinstance(features, list):
        return raw_text

    kept: list[Any] = []
    removed_jimok: Counter[str] = Counter()
    removed_zone: Counter[str] = Counter()
    for feature in features:
        props = feature.get("properties") if isinstance(feature, dict) else {}
        if not isinstance(props, dict):
            props = {}
        reason = _exclude_reason(props)
        if reason is None:
            _annotate_buildability(props)
            kept.append(feature)
            continue
        kind, value = reason
        if kind == "jimok":
            removed_jimok[value] += 1
        elif kind == "zone":
            removed_zone[value] += 1

    removed_count = len(features) - len(kept)
    if removed_count <= 0:
        return raw_text

    target["features"] = kept
    target["total_before_visual_filter"] = len(features)
    target["total"] = len(kept)
    target["visual_filter_applied"] = {
        "reason": "buildable_candidate_search",
        "removed_count": removed_count,
        "removed_jimok": dict(sorted(removed_jimok.items())),
        "removed_zone": dict(sorted(removed_zone.items())),
    }
    return json.dumps(filtered, ensure_ascii=False)


def _feature_container(payload: Any) -> dict[str, Any] | None:
    if isinstance(payload, dict) and payload.get("ok") is True and isinstance(payload.get("result"), dict):
        payload = payload["result"]
    if isinstance(payload, dict) and isinstance(payload.get("features"), list):
        return payload
    return None


def _exclude_reason(props: dict[str, Any]) -> tuple[str, str] | None:
    jimok = _text(props.get("jimok"))
    if jimok in NON_BUILDABLE_JIMOK:
        return ("jimok", jimok)

    zone = _text(props.get("zone") or props.get("zone_name") or props.get("land_use") or props.get("landuse"))
    for keyword in RESTRICTED_ZONE_KEYWORDS:
        if keyword in zone:
            return ("zone", keyword)
    return None


def _annotate_buildability(props: dict[str, Any]) -> None:
    jimok = _text(props.get("jimok"))
    if not jimok or props.get("buildability"):
        return
    if jimok in BUILDABLE_JIMOK:
        props["buildability"] = f"✅ {jimok}(건축 가능)"
    elif jimok in DIFFICULT_JIMOK:
        props["buildability"] = f"⚠️ {jimok}(전용허가 필요)"
    else:
        props["buildability"] = f"⚠️ {jimok}(확인 필요)"


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()
