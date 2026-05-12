import json

from qwen_mcp_bridge.visual_filter import (
    filter_buildable_candidate_result,
    should_filter_buildable_visual_result,
    should_suppress_intermediate_parcel_visual_result,
    suppress_intermediate_parcel_visual_result,
)


def test_filter_buildable_candidate_result_removes_non_buildable_jimok():
    raw = json.dumps({
        "total": 2,
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": []},
                "properties": {"pnu": "road", "address": "도로필지", "jimok": "도"},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": []},
                "properties": {"pnu": "site", "address": "대지필지", "jimok": "대"},
            },
        ],
    }, ensure_ascii=False)

    filtered = json.loads(filter_buildable_candidate_result(raw))

    assert filtered["total"] == 1
    assert filtered["total_before_visual_filter"] == 2
    assert filtered["features"][0]["properties"]["pnu"] == "site"
    assert filtered["visual_filter_applied"]["removed_count"] == 1
    assert filtered["visual_filter_applied"]["removed_jimok"] == {"도": 1}


def test_filter_buildable_candidate_result_removes_full_jimok_names():
    raw = json.dumps({
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": []},
                "properties": {"pnu": "road", "address": "양재동 349-9", "jimok": "도로"},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": []},
                "properties": {"pnu": "river", "address": "양재동 349-3", "jimok": "하천"},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": []},
                "properties": {"pnu": "site", "address": "양재동 344-7", "jimok": "대지"},
            },
        ],
    }, ensure_ascii=False)

    filtered = json.loads(filter_buildable_candidate_result(raw))

    assert [f["properties"]["pnu"] for f in filtered["features"]] == ["site"]
    assert filtered["features"][0]["properties"]["buildability"] == "✅ 대지(1차 후보)"
    assert filtered["visual_filter_applied"]["removed_jimok"] == {"도로": 1, "하천": 1}


def test_filter_buildable_candidate_result_preserves_non_feature_json():
    raw = '{"items":[{"name":"양재역"}]}'

    assert filter_buildable_candidate_result(raw) == raw


def test_filter_buildable_candidate_result_handles_ok_result_envelope():
    raw = json.dumps({
        "ok": True,
        "result": {
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": []},
                    "properties": {"pnu": "river", "jimok": "천"},
                },
                {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": []},
                    "properties": {"pnu": "site", "jimok": "잡"},
                },
            ],
        },
    }, ensure_ascii=False)

    filtered = json.loads(filter_buildable_candidate_result(raw))

    assert filtered["ok"] is True
    assert [f["properties"]["pnu"] for f in filtered["result"]["features"]] == ["site"]
    assert filtered["result"]["visual_filter_applied"]["removed_jimok"] == {"천": 1}


def test_existing_multifamily_search_suppresses_broad_intermediate_parcel_visuals():
    messages = [{"role": "user", "content": "양재동 344-7근처 다세대주택"}]

    assert should_suppress_intermediate_parcel_visual_result("analyze__find_parcels", messages)
    assert not should_filter_buildable_visual_result("analyze__find_parcels", messages)


def test_explicit_new_build_search_uses_buildable_visual_filter_not_suppression():
    messages = [{"role": "user", "content": "양재동 344-7근처 다세대주택 신축 후보 필지"}]

    assert should_filter_buildable_visual_result("analyze__find_parcels", messages)
    assert not should_suppress_intermediate_parcel_visual_result("analyze__find_parcels", messages)


def test_suppress_intermediate_parcel_visual_result_preserves_tool_metadata_without_features():
    raw = json.dumps({
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": []},
                "properties": {"pnu": "candidate", "address": "양재동 349-9", "jimok": "도로"},
            }
        ],
    }, ensure_ascii=False)

    suppressed = json.loads(suppress_intermediate_parcel_visual_result(raw))

    assert suppressed["features"] == []
    assert suppressed["total"] == 0
    assert suppressed["total_before_visual_suppress"] == 1
    assert suppressed["visual_suppressed"]["reason"] == "existing_building_search_intermediate_parcels"
