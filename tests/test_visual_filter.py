import json

from qwen_mcp_bridge.visual_filter import (
    filter_buildable_candidate_result,
    paginate_feature_collection_visual_result,
    should_filter_buildable_visual_result,
    should_suppress_intermediate_parcel_visual_result,
    split_existing_building_statistics_result,
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


def test_split_existing_building_statistics_result_separates_model_and_visual_payloads():
    raw = json.dumps({
        "type": "FeatureCollection",
        "matched_buildings": 2,
        "coverage": "full",
        "parcels_probed": 80,
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [[[127, 37], [127.001, 37], [127.001, 37.001], [127, 37.001], [127, 37]]]},
                "properties": {"pnu": "p1", "address": "문정동 118-15", "matched_use": "다세대주택"},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [[[127.002, 37], [127.003, 37], [127.003, 37.001], [127.002, 37.001], [127.002, 37]]]},
                "properties": {"pnu": "p2", "address": "문정동 118-17", "matched_use": "다세대주택"},
            },
        ],
        "detail_probe_log": "x" * 300_000,
    }, ensure_ascii=False)

    model_text, visual_text = split_existing_building_statistics_result(raw)

    model = json.loads(model_text)
    visual = json.loads(visual_text)
    assert "features" not in model
    assert model["matched_buildings"] == 2
    assert model["features_omitted_for_model"] == 2
    assert model["visual_payload_split"]["reason"] == "keep_model_context_stats_only"
    assert visual["type"] == "FeatureCollection"
    assert [feature["properties"]["pnu"] for feature in visual["features"]] == ["p1", "p2"]
    assert visual["matched_buildings"] == 2
    assert visual["coverage"] == "full"
    assert "detail_probe_log" not in visual


def test_paginate_feature_collection_visual_result_returns_manifest_and_valid_pages():
    features = []
    for idx in range(12):
        lng = 127 + idx * 0.001
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[lng, 37], [lng + 0.0005, 37], [lng + 0.0005, 37.0005], [lng, 37.0005], [lng, 37]]],
            },
            "properties": {"pnu": f"P{idx}", "address": "문정동 " + ("긴주소" * 40)},
        })
    raw = json.dumps({
        "type": "FeatureCollection",
        "matched_buildings": 12,
        "features": features,
    }, ensure_ascii=False)

    manifest_text, page_texts = paginate_feature_collection_visual_result(
        raw,
        max_result_bytes=1_500,
        page_target_bytes=900,
    )

    manifest = json.loads(manifest_text)
    pages = [json.loads(text) for text in page_texts]
    assert len(manifest_text.encode("utf-8")) < 1_500
    assert manifest["type"] == "FeatureCollection"
    assert manifest["features"] == []
    assert manifest["matched_buildings"] == 12
    assert manifest["bbox"] == [127.0, 37, 127.0115, 37.0005]
    assert manifest["visual_payload_paged"]["feature_count"] == 12
    assert manifest["visual_payload_paged"]["page_count"] == len(pages)
    assert len(pages) > 1
    assert sum(len(page["features"]) for page in pages) == 12
    assert pages[0]["visual_payload_page"]["page_index"] == 0
    assert pages[-1]["visual_payload_page"]["page_count"] == len(pages)
