from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from qwen_mcp_bridge.routing_debug import build_routing_debug


_FIXTURE_DIR = Path(__file__).with_name("fixtures")


def load_routing_debug_cases(filename: str) -> list[dict[str, Any]]:
    fixture_path = _FIXTURE_DIR / filename
    return json.loads(fixture_path.read_text(encoding="utf-8"))


def assert_routing_debug_case(case: dict[str, Any]) -> None:
    case_name = case.get("name", "<unnamed>")
    debug = build_routing_debug(case["messages"])
    expected = case["expected"]

    assert debug["intent"] == expected["intent"], f"{case_name}: intent"
    assert debug["bucket"] == expected["bucket"], f"{case_name}: bucket"

    anchor = expected["anchor"]
    assert debug["anchor_type"] == anchor["type"], f"{case_name}: anchor_type"
    assert debug["anchor_text"] == anchor["text"], f"{case_name}: anchor_text"

    _assert_required_chain(case_name, debug, expected["required_chain"])
    _assert_visual_contract(case_name, debug, expected["visual"])


def _assert_required_chain(
    case_name: str,
    debug: dict[str, str],
    expected_chain: dict[str, list[str]],
) -> None:
    required_chain = debug.get("required_chain", "")
    assert required_chain, f"{case_name}: required_chain missing"

    for fragment in expected_chain.get("contains", []):
        assert fragment in required_chain, f"{case_name}: required_chain missing {fragment!r}"
    for fragment in expected_chain.get("not_contains", []):
        assert fragment not in required_chain, f"{case_name}: required_chain includes {fragment!r}"


def _assert_visual_contract(
    case_name: str,
    debug: dict[str, str],
    expected_visual: dict[str, Any],
) -> None:
    expected_suppress = expected_visual.get("suppress")
    if expected_suppress is None:
        assert "visual_suppress" not in debug, f"{case_name}: visual_suppress should be absent"
    else:
        assert debug.get("visual_suppress") == expected_suppress, f"{case_name}: visual_suppress"

    if expected_visual.get("required"):
        assert debug.get("visual_required") == "true", f"{case_name}: visual_required"
    else:
        assert "visual_required" not in debug, f"{case_name}: visual_required should be absent"
