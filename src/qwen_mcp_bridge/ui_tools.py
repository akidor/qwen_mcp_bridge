"""In-process UI 컨트롤 도구 도메인.

stdio MCP가 아닌 bridge 내부 dispatch. 호출 시 즉시 ack + chat_loop_streaming이 SSE
`ui_action` event를 발화해 frontend가 실제 UI state 변경을 처리.

도구 6개:
- ui__set_basemap(kind)
- ui__toggle_wms_layer(label, on)
- ui__set_3d(terrain?, buildings?)
- ui__enable_draw(on)
- ui__fly_to(lng, lat, zoom?)
- ui__clear_layers(category)
"""
from __future__ import annotations
from typing import Any

UI_TOOLS: dict[str, dict] = {
    "ui__set_basemap": {
        "description": (
            "지도 배경(basemap)을 변경한다. "
            "kind: white(백지도) | base(일반) | satellite(위성) | midnight(야간) | hybrid(하이브리드). "
            "예: 사용자가 '위성지도로 바꿔'라 하면 kind=satellite."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {
                    "type": "string",
                    "enum": ["white", "base", "satellite", "midnight", "hybrid"],
                },
            },
            "required": ["kind"],
        },
    },
    "ui__toggle_wms_layer": {
        "description": (
            "WMS 트리의 layer를 켜거나 끈다. label은 트리 leaf 이름의 부분 매칭(첫 매칭 사용). "
            "예: '용도지역', '도로', '도시계획'. "
            "사용자가 '용도지역 레이어 켜줘'라 하면 label='용도지역', on=true."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "label": {"type": "string", "description": "WMS leaf label 부분 일치"},
                "on": {"type": "boolean"},
            },
            "required": ["label", "on"],
        },
    },
    "ui__set_3d": {
        "description": (
            "3D 지형(terrain) / 3D 건물(buildings) 토글. 둘 중 하나만 지정해도 OK. "
            "예: '3D 켜' → terrain=true, buildings=true. '3D 지형만 켜' → terrain=true."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "terrain": {"type": ["boolean", "null"]},
                "buildings": {"type": ["boolean", "null"]},
            },
        },
    },
    "ui__enable_draw": {
        "description": "그리기(폴리곤/라인/포인트) 모드 토글.",
        "input_schema": {
            "type": "object",
            "properties": {"on": {"type": "boolean"}},
            "required": ["on"],
        },
    },
    "ui__fly_to": {
        "description": (
            "지도 카메라를 lng/lat로 이동. zoom은 옵션(default 14). "
            "사용자가 '강남역으로 이동'이라 하면 먼저 locate__search_facility로 좌표 얻고 ui__fly_to로 chain."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "lng": {"type": "number", "minimum": -180, "maximum": 180},
                "lat": {"type": "number", "minimum": -90, "maximum": 90},
                "zoom": {"type": ["number", "null"], "minimum": 0, "maximum": 22},
            },
            "required": ["lng", "lat"],
        },
    },
    "ui__clear_layers": {
        "description": (
            "지도에서 layer를 일괄 정리. "
            "category: all(전체) | tools(도구 결과만) | draw(그린 도형만) | wms(WMS overlay만)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": ["all", "tools", "draw", "wms"],
                },
            },
            "required": ["category"],
        },
    },
}


def is_ui_tool(name: str) -> bool:
    return name.startswith("ui__")


def list_ui_openai_tools() -> list[dict]:
    """OpenAI tools 형식으로 6개 ui 도구 반환."""
    out: list[dict] = []
    for name, defn in UI_TOOLS.items():
        out.append({
            "type": "function",
            "function": {
                "name": name,
                "description": defn["description"],
                "parameters": defn["input_schema"],
            },
        })
    return out


def dispatch_ui_tool(name: str, args: dict) -> dict[str, Any]:
    """In-process ack 반환. 실제 UI 변경은 frontend SSE handler가 처리."""
    if name not in UI_TOOLS:
        raise KeyError(f"unknown ui tool: {name}")
    return {
        "ok": True,
        "action": name,
        "params": args,
        "message": f"ui dispatched: {name}",
    }
