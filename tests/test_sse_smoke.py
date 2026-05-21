import json

from qwen_mcp_bridge.sse_smoke import analyze_sse_events, parse_sse_text


def _event(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _page_event(
    *,
    call_id: str = "call_1",
    name: str = "analyze__existing_building_statistics",
    page_index: int = 0,
    page_count: int = 1,
    features: list[dict] | None = None,
) -> str:
    return _event({
        "type": "tool_result_page",
        "name": name,
        "tool_call_id": call_id,
        "page_index": page_index,
        "page_count": page_count,
        "result_text": json.dumps({
            "type": "FeatureCollection",
            "features": features if features is not None else [{"type": "Feature"}],
        }),
    })


def _end_event(
    *,
    result_text: str,
    call_id: str = "call_1",
    name: str = "analyze__existing_building_statistics",
) -> str:
    return _event({
        "type": "tool_call_end",
        "name": name,
        "tool_call_id": call_id,
        "result_text": result_text,
    })


def test_sse_smoke_summary_validates_paged_feature_manifest():
    text = "".join([
        _page_event(page_index=0, page_count=2, features=[{"type": "Feature", "properties": {"pnu": "P1"}}]),
        _page_event(page_index=1, page_count=2, features=[{"type": "Feature", "properties": {"pnu": "P2"}}]),
        _end_event(result_text=json.dumps({
            "type": "FeatureCollection",
            "features": [],
            "visual_payload_paged": {"feature_count": 2, "page_count": 2},
        })),
        "data: [DONE]\n\n",
    ])

    parsed = parse_sse_text(text)
    summary = analyze_sse_events(parsed.events, done_seen=parsed.done_seen)

    assert summary.done_seen is True
    assert summary.tool_result_pages == 2
    assert summary.tool_result_page_features == 2
    assert summary.paged_manifests == 1
    assert summary.errors == []


def test_sse_smoke_summary_reports_page_manifest_mismatch():
    text = "".join([
        _page_event(),
        _end_event(result_text=json.dumps({
            "type": "FeatureCollection",
            "features": [],
            "visual_payload_paged": {"feature_count": 2, "page_count": 1},
        })),
        "data: [DONE]\n\n",
    ])

    parsed = parse_sse_text(text)
    summary = analyze_sse_events(parsed.events, done_seen=parsed.done_seen)

    assert summary.errors == ["call_1: paged feature_count mismatch: pages=1 manifest=2"]


def test_sse_smoke_summary_validates_nested_ok_result_paged_manifest():
    text = "".join([
        _page_event(name="analyze__find_existing_buildings"),
        _end_event(
            name="analyze__find_existing_buildings",
            result_text=json.dumps({
                "ok": True,
                "result": {
                    "total": 1,
                    "features": [],
                    "visual_payload_paged": {"feature_count": 1, "page_count": 1},
                },
            }),
        ),
        "data: [DONE]\n\n",
    ])

    parsed = parse_sse_text(text)
    summary = analyze_sse_events(parsed.events, done_seen=parsed.done_seen)

    assert summary.paged_manifests == 1
    assert summary.errors == []


def test_sse_smoke_summary_ignores_plain_text_tool_results():
    text = "".join([
        _end_event(
            call_id="call_text",
            name="analyze__find_existing_buildings",
            result_text="Input validation error: bad arguments",
        ),
        "data: [DONE]\n\n",
    ])

    parsed = parse_sse_text(text)
    summary = analyze_sse_events(parsed.events, done_seen=parsed.done_seen)

    assert summary.tool_call_ends == 1
    assert summary.errors == []


def test_sse_smoke_summary_reports_invalid_tool_result_json():
    text = "".join([
        _end_event(
            call_id="call_bad",
            name="locate__search_address",
            result_text="{\"broken\"",
        ),
        "data: [DONE]\n\n",
    ])

    parsed = parse_sse_text(text)
    summary = analyze_sse_events(parsed.events, done_seen=parsed.done_seen)

    assert summary.errors == ["call_bad: tool_call_end result_text is not valid JSON"]
