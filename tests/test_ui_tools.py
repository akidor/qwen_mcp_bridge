import pytest
from qwen_mcp_bridge.ui_tools import (
    UI_TOOLS,
    is_ui_tool,
    list_ui_openai_tools,
    dispatch_ui_tool,
)


def test_ui_tools_count_six():
    assert len(UI_TOOLS) == 6
    assert "ui__set_basemap" in UI_TOOLS
    assert "ui__toggle_wms_layer" in UI_TOOLS
    assert "ui__set_3d" in UI_TOOLS
    assert "ui__enable_draw" in UI_TOOLS
    assert "ui__fly_to" in UI_TOOLS
    assert "ui__clear_layers" in UI_TOOLS


def test_is_ui_tool():
    assert is_ui_tool("ui__set_basemap") is True
    assert is_ui_tool("ui__toggle_wms_layer") is True
    assert is_ui_tool("locate__search_address") is False
    assert is_ui_tool("ui_") is False
    assert is_ui_tool("") is False


def test_list_ui_openai_tools_shape():
    tools = list_ui_openai_tools()
    assert len(tools) == 6
    for t in tools:
        assert t["type"] == "function"
        assert t["function"]["name"].startswith("ui__")
        assert "description" in t["function"]
        assert "parameters" in t["function"]


def test_dispatch_ui_tool_ack():
    out = dispatch_ui_tool("ui__set_basemap", {"kind": "satellite"})
    assert out["ok"] is True
    assert out["action"] == "ui__set_basemap"
    assert out["params"] == {"kind": "satellite"}
    assert "message" in out


def test_dispatch_unknown_raises():
    with pytest.raises(KeyError):
        dispatch_ui_tool("ui__unknown", {})
