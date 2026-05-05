from types import SimpleNamespace
from qwen_mcp_bridge.tool_translation import (
    mcp_tool_to_openai,
    parse_prefixed_name,
    PrefixError,
)
import pytest


def make_tool(name: str, description: str, schema: dict) -> SimpleNamespace:
    return SimpleNamespace(name=name, description=description, inputSchema=schema)


def test_mcp_tool_to_openai_basic():
    tool = make_tool(
        "search_address",
        "주소 검색",
        {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
    )
    result = mcp_tool_to_openai(tool, "locate")
    assert result == {
        "type": "function",
        "function": {
            "name": "locate__search_address",
            "description": "주소 검색",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        },
    }


def test_mcp_tool_to_openai_empty_description_becomes_empty_string():
    tool = make_tool("foo", None, {"type": "object", "properties": {}})
    result = mcp_tool_to_openai(tool, "bar")
    assert result["function"]["description"] == ""


def test_mcp_tool_to_openai_missing_schema_uses_empty_object():
    tool = make_tool("foo", "x", None)
    result = mcp_tool_to_openai(tool, "bar")
    assert result["function"]["parameters"] == {"type": "object", "properties": {}}


def test_parse_prefixed_name_basic():
    assert parse_prefixed_name("locate__search_address") == ("locate", "search_address")


def test_parse_prefixed_name_tool_with_underscore():
    # tool 이름에 underscore 포함 시 첫 __ 만 split
    assert parse_prefixed_name("analyze__land_composition") == ("analyze", "land_composition")


def test_parse_prefixed_name_no_separator_raises():
    with pytest.raises(PrefixError):
        parse_prefixed_name("invalidname")


def test_parse_prefixed_name_empty_domain_raises():
    with pytest.raises(PrefixError):
        parse_prefixed_name("__tool")


def test_parse_prefixed_name_empty_tool_raises():
    with pytest.raises(PrefixError):
        parse_prefixed_name("domain__")


def test_name_length_under_64():
    # OpenAI function name limit
    tool = make_tool("incorporation_distribution", "x", {"type": "object", "properties": {}})
    result = mcp_tool_to_openai(tool, "analyze")
    name = result["function"]["name"]
    assert len(name) <= 64
    assert name == "analyze__incorporation_distribution"
