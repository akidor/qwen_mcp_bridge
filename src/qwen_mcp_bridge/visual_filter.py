"""Filters applied only to frontend visualization payloads."""
from __future__ import annotations

import copy
import json
import re
from collections import Counter
from typing import Any


BUILDABLE_VISUAL_TOOLS = {"analyze__find_parcels", "locate__parcels_in_boundary"}
INTERMEDIATE_PARCEL_VISUAL_TOOLS = {"analyze__find_parcels", "locate__parcels_in_boundary"}
EXISTING_BUILDING_STATISTICS_TOOL = "analyze__existing_building_statistics"
EXISTING_STATS_VISUAL_META_KEYS = (
    "matched_buildings",
    "matched_count",
    "total",
    "coverage",
    "parcels_probed",
    "eligible_parcels",
    "radius_m",
    "center",
    "use_keywords",
    "expanded_use_keywords",
    "filter_applied",
    "detail_fetch_mode",
    "detail_concurrency",
)
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
MULTIFAMILY_RE = re.compile(r"다세대|다가구|공동주택|연립")
NEW_BUILD_INTENT_RE = re.compile(r"신축|건축|개발|매수|부지|필지|나대지|땅|짓|지을|가능|후보지")
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
        if message.get("role") == "user" and isinstance(content, str) and NEW_BUILD_INTENT_RE.search(content):
            return True
    return False


def should_suppress_intermediate_parcel_visual_result(tool_name: str, messages: list[dict[str, Any]]) -> bool:
    if tool_name not in INTERMEDIATE_PARCEL_VISUAL_TOOLS:
        return False

    suppress_marker = "visual_suppress=intermediate_parcel_candidates"
    build_marker = "post_filter=건축 의도 있음"
    has_build_marker = False
    for message in messages:
        content = message.get("content")
        if not isinstance(content, str):
            continue
        if suppress_marker in content:
            return True
        if build_marker in content:
            has_build_marker = True

    if has_build_marker:
        return False

    for message in reversed(messages):
        content = message.get("content")
        if message.get("role") != "user" or not isinstance(content, str):
            continue
        return _is_existing_multifamily_search(content)
    return False


def suppress_intermediate_parcel_visual_result(raw_text: str) -> str:
    try:
        raw = json.loads(raw_text)
    except json.JSONDecodeError:
        return raw_text

    suppressed = copy.deepcopy(raw)
    target = _feature_container(suppressed)
    if target is None:
        return raw_text

    features = target.get("features")
    if not isinstance(features, list):
        return raw_text

    target["features"] = []
    target["total_before_visual_suppress"] = len(features)
    target["total"] = 0
    target["visual_suppressed"] = {
        "reason": "existing_building_search_intermediate_parcels",
        "message": "기존 건축물 조회의 중간 필지 풀은 지도 후보로 표시하지 않음",
    }
    return json.dumps(suppressed, ensure_ascii=False)


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


def split_existing_building_statistics_result(raw_text: str) -> tuple[str, str]:
    """Return (model_text, visual_text) for existing building statistics results.

    The model only needs stats and examples; the frontend needs full geometry
    features. Keeping both in one SSE payload can exceed the frontend cap and
    leave result_text as truncated invalid JSON.
    """
    try:
        raw = json.loads(raw_text)
    except json.JSONDecodeError:
        return raw_text, raw_text

    target = _feature_container(raw)
    if target is None:
        return raw_text, raw_text

    features = target.get("features")
    if not isinstance(features, list):
        return raw_text, raw_text

    model_payload = copy.deepcopy(raw)
    model_target = _feature_container(model_payload)
    if model_target is None:
        return raw_text, raw_text

    model_target.pop("features", None)
    if model_target.get("type") == "FeatureCollection":
        model_target.pop("type", None)
    model_target["features_omitted_for_model"] = len(features)
    model_target["visual_payload_split"] = {
        "reason": "keep_model_context_stats_only",
        "visual_result_text": "FeatureCollection with matched parcel/building geometries was sent only to the frontend SSE result_text.",
    }

    visual_payload = {
        "type": "FeatureCollection",
        "features": features,
        "visual_payload_split": {
            "reason": "keep_sse_payload_geojson_only",
            "model_result_text": "Statistics and verbose probe details were sent only to the model tool message.",
        },
    }
    for key in EXISTING_STATS_VISUAL_META_KEYS:
        if key in target:
            visual_payload[key] = target[key]

    return (
        json.dumps(model_payload, ensure_ascii=False),
        json.dumps(visual_payload, ensure_ascii=False),
    )


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
        props["buildability"] = f"✅ {jimok}(1차 후보)"
    elif jimok in DIFFICULT_JIMOK:
        props["buildability"] = f"⚠️ {jimok}(전용허가 필요)"
    else:
        props["buildability"] = f"⚠️ {jimok}(확인 필요)"


def _is_existing_multifamily_search(text: str) -> bool:
    return bool(MULTIFAMILY_RE.search(text)) and not bool(NEW_BUILD_INTENT_RE.search(text))


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()
