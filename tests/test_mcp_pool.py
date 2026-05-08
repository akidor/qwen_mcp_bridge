import os
import pytest
from qwen_mcp_bridge.mcp_pool import McpPool, DOMAINS, PoolNotReadyError


URBAN_MCP_ROOT = os.environ.get("URBAN_MCP_ROOT", "/home/akidor/urban_mcp")


@pytest.mark.asyncio
async def test_pool_lifecycle_with_locate_domain_only():
    """locate 도메인 1개만 spawn해 list_tools / dispatch 검증.
    8 도메인 모두 spawn하는 건 시간 비용 큼 — 1 도메인 무리 검증."""
    pool = McpPool(urban_mcp_root=URBAN_MCP_ROOT, domains=("locate",))
    await pool.start()
    try:
        tools = pool.list_openai_tools()
        # locate 도메인 5 tool 확인
        names = [t["function"]["name"] for t in tools]
        assert "locate__search_address" in names
        assert "locate__get_parcel" in names
        # stdio 도구는 모두 locate prefix (in-process ui__* 제외)
        stdio_names = [n for n in names if not n.startswith("ui__")]
        assert all(n.startswith("locate__") for n in stdio_names)
        # P18 T1: ui__* in-process 도구도 함께 노출
        assert "ui__set_basemap" in names

        # dispatch — get_parcel은 backend 호출이라 빈 PNU로 InvalidInputError 기대.
        # mcp.call_tool은 에러 자체도 isError=true 결과로 반환하지 raise하지 않음.
        result = await pool.dispatch("locate__search_address", {"query": "역삼동 738"})
        assert result is not None
    finally:
        await pool.close()


@pytest.mark.asyncio
async def test_pool_dispatch_unknown_domain_raises():
    pool = McpPool(urban_mcp_root=URBAN_MCP_ROOT, domains=("locate",))
    await pool.start()
    try:
        with pytest.raises(KeyError):
            await pool.dispatch("nonexistent__tool", {})
    finally:
        await pool.close()


@pytest.mark.asyncio
async def test_pool_dispatch_before_start_raises():
    pool = McpPool(urban_mcp_root=URBAN_MCP_ROOT, domains=("locate",))
    with pytest.raises(PoolNotReadyError):
        await pool.dispatch("locate__search_address", {"query": "x"})


def test_default_domains_count():
    # 8 도메인 (P4에 analyze 추가됨)
    assert len(DOMAINS) == 8
    assert set(DOMAINS) == {
        "locate", "inspect", "reach", "simulate",
        "estimate", "design", "export", "analyze",
    }
