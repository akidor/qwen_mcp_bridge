from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass, field
from typing import Any, Iterable

import httpx


DEFAULT_PROMPT = "문정동 118-15 근처 다세대주택 1km 반경으로 시각화"


@dataclass
class ParsedSse:
    events: list[dict[str, Any]]
    done_seen: bool
    parse_errors: list[str] = field(default_factory=list)


@dataclass
class SseSmokeSummary:
    done_seen: bool
    events: int
    tool_call_ends: int
    tool_result_pages: int
    tool_result_page_features: int
    paged_manifests: int
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def parse_sse_text(text: str) -> ParsedSse:
    events: list[dict[str, Any]] = []
    parse_errors: list[str] = []
    done_seen = False
    for block in text.split("\n\n"):
        data_lines = [
            line.removeprefix("data:").strip()
            for line in block.splitlines()
            if line.startswith("data:")
        ]
        if not data_lines:
            continue
        payload = "\n".join(data_lines)
        if payload == "[DONE]":
            done_seen = True
            continue
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError as exc:
            parse_errors.append(f"sse event JSON parse failed: {exc}")
            continue
        if isinstance(parsed, dict):
            events.append(parsed)
    return ParsedSse(events=events, done_seen=done_seen, parse_errors=parse_errors)


def parse_sse_lines(lines: Iterable[str]) -> ParsedSse:
    blocks: list[str] = []
    current: list[str] = []
    for line in lines:
        if line == "":
            if current:
                blocks.append("\n".join(current))
                current = []
            continue
        current.append(line)
    if current:
        blocks.append("\n".join(current))
    return parse_sse_text("\n\n".join(blocks) + "\n\n")


def analyze_sse_events(
    events: list[dict[str, Any]],
    *,
    done_seen: bool,
    parse_errors: list[str] | None = None,
) -> SseSmokeSummary:
    errors = list(parse_errors or [])
    tool_call_ends = 0
    tool_result_pages = 0
    tool_result_page_features = 0
    paged_manifests = 0
    page_features_by_call: dict[str, int] = {}
    page_count_by_call: dict[str, int] = {}

    for event in events:
        event_type = event.get("type")
        tool_call_id = _tool_call_id(event)
        if event_type == "tool_result_page":
            tool_result_pages += 1
            result = _parse_result_text(
                event,
                errors,
                context=f"{tool_call_id}: tool_result_page result_text",
                require_json=True,
            )
            features = result.get("features") if isinstance(result, dict) else None
            feature_count = len(features) if isinstance(features, list) else 0
            tool_result_page_features += feature_count
            page_features_by_call[tool_call_id] = page_features_by_call.get(tool_call_id, 0) + feature_count
            page_count_by_call[tool_call_id] = page_count_by_call.get(tool_call_id, 0) + 1
            continue

        if event_type == "tool_call_end":
            tool_call_ends += 1
            result = _parse_result_text(
                event,
                errors,
                context=f"{tool_call_id}: tool_call_end result_text",
            )
            if not isinstance(result, dict):
                continue
            paged = _visual_payload_paged(result)
            if not isinstance(paged, dict):
                continue
            paged_manifests += 1
            expected_features = _int_or_none(paged.get("feature_count"))
            expected_pages = _int_or_none(paged.get("page_count"))
            actual_features = page_features_by_call.get(tool_call_id, 0)
            actual_pages = page_count_by_call.get(tool_call_id, 0)
            if expected_features is not None and actual_features != expected_features:
                errors.append(_mismatch_error(tool_call_id, "feature_count", actual_features, expected_features))
            if expected_pages is not None and actual_pages != expected_pages:
                errors.append(_mismatch_error(tool_call_id, "page_count", actual_pages, expected_pages))

    if not done_seen:
        errors.append("SSE stream did not finish with [DONE]")

    return SseSmokeSummary(
        done_seen=done_seen,
        events=len(events),
        tool_call_ends=tool_call_ends,
        tool_result_pages=tool_result_pages,
        tool_result_page_features=tool_result_page_features,
        paged_manifests=paged_manifests,
        errors=errors,
    )


def run_live_smoke(
    *,
    base_url: str,
    prompt: str,
    model: str | None = None,
    timeout: float = 240.0,
    expect_paged: bool = False,
    min_pages: int = 1,
) -> SseSmokeSummary:
    url = base_url.rstrip("/") + "/v1/chat/completions"
    body: dict[str, Any] = {
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
        "temperature": 0.1,
        "chat_template_kwargs": {"enable_thinking": False},
    }
    if model:
        body["model"] = model

    with httpx.stream("POST", url, json=body, timeout=timeout) as response:
        response.raise_for_status()
        parsed = parse_sse_lines(response.iter_lines())

    summary = analyze_sse_events(
        parsed.events,
        done_seen=parsed.done_seen,
        parse_errors=parsed.parse_errors,
    )
    if expect_paged and summary.tool_result_pages < min_pages:
        summary.errors.append(
            f"expected at least {min_pages} tool_result_page events, got {summary.tool_result_pages}"
        )
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Smoke-test qwen_mcp_bridge streaming paged tool results.")
    parser.add_argument("--url", default="http://127.0.0.1:8090", help="Bridge base URL")
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--model", default=None)
    parser.add_argument("--timeout", type=float, default=240.0)
    parser.add_argument("--expect-paged", action="store_true")
    parser.add_argument("--min-pages", type=int, default=1)
    args = parser.parse_args(argv)

    summary = run_live_smoke(
        base_url=args.url,
        prompt=args.prompt,
        model=args.model,
        timeout=args.timeout,
        expect_paged=args.expect_paged,
        min_pages=args.min_pages,
    )
    print(json.dumps(summary.to_dict(), ensure_ascii=False, indent=2))
    return 1 if summary.errors else 0


def _parse_result_text(
    event: dict[str, Any],
    errors: list[str],
    *,
    context: str,
    require_json: bool = False,
) -> Any:
    result_text = event.get("result_text")
    if not isinstance(result_text, str) or not result_text:
        return None
    if not require_json and not _looks_like_json(result_text):
        return None
    try:
        return json.loads(result_text)
    except json.JSONDecodeError:
        errors.append(f"{_tool_call_id(event)}: {context.split(': ', 1)[1]} is not valid JSON")
        return None


def _visual_payload_paged(result: dict[str, Any]) -> dict[str, Any] | None:
    paged = result.get("visual_payload_paged")
    if isinstance(paged, dict):
        return paged
    nested = result.get("result")
    if isinstance(nested, dict):
        paged = nested.get("visual_payload_paged")
        if isinstance(paged, dict):
            return paged
    return None


def _looks_like_json(value: str) -> bool:
    stripped = value.lstrip()
    return stripped.startswith("{") or stripped.startswith("[")


def _mismatch_error(tool_call_id: str, field: str, actual: int, expected: int) -> str:
    return f"{tool_call_id}: paged {field} mismatch: pages={actual} manifest={expected}"


def _tool_call_id(event: dict[str, Any]) -> str:
    value = event.get("tool_call_id") or event.get("name")
    return str(value) if value else "(unknown)"


def _int_or_none(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
