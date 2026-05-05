"""urban_mcp 8개 도메인 stdio MCP 서버 풀."""
from __future__ import annotations

import logging
from contextlib import AsyncExitStack
from typing import Any, Iterable

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from qwen_mcp_bridge.tool_translation import (
    mcp_tool_to_openai,
    parse_prefixed_name,
    PrefixError,
)


DOMAINS: tuple[str, ...] = (
    "locate", "inspect", "reach", "simulate",
    "estimate", "design", "export", "analyze",
)


class PoolNotReadyError(RuntimeError):
    """McpPool.start()가 끝나기 전에 dispatch 호출됨."""


logger = logging.getLogger(__name__)


class McpPool:
    """stdio MCP 서버 풀.

    Usage:
        pool = McpPool(urban_mcp_root="/home/akidor/urban_mcp")
        await pool.start()
        try:
            tools = pool.list_openai_tools()
            result = await pool.dispatch("locate__search_address", {"query": "..."})
        finally:
            await pool.close()
    """

    def __init__(
        self,
        urban_mcp_root: str,
        domains: Iterable[str] = DOMAINS,
    ) -> None:
        self.urban_mcp_root = urban_mcp_root
        self.domains = tuple(domains)
        self._stack: AsyncExitStack | None = None
        self._sessions: dict[str, ClientSession] = {}
        self._tools_by_domain: dict[str, list[Any]] = {}
        self._failed_domains: dict[str, str] = {}

    async def start(self) -> None:
        self._stack = AsyncExitStack()
        await self._stack.__aenter__()

        # 도메인별 spawn — 일부 실패해도 다른 도메인은 살아남게 함.
        for domain in self.domains:
            try:
                session = await self._spawn_domain(domain)
                tools_resp = await session.list_tools()
                self._sessions[domain] = session
                self._tools_by_domain[domain] = list(tools_resp.tools)
                logger.info("도메인 %s spawn OK — tool %d개", domain, len(tools_resp.tools))
            except Exception as e:
                self._failed_domains[domain] = str(e)
                logger.warning("도메인 %s spawn 실패: %s", domain, e)

    async def _spawn_domain(self, domain: str) -> ClientSession:
        params = StdioServerParameters(
            command="uv",
            args=[
                "--directory", self.urban_mcp_root,
                "run", "python", "-m", f"urban_mcp_{domain}",
            ],
        )
        assert self._stack is not None
        read, write = await self._stack.enter_async_context(stdio_client(params))
        session = await self._stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        return session

    def list_openai_tools(self) -> list[dict]:
        """모든 살아있는 도메인의 tool을 OpenAI 형식으로 반환 (prefix 부착)."""
        result: list[dict] = []
        for domain, tools in self._tools_by_domain.items():
            for t in tools:
                result.append(mcp_tool_to_openai(t, domain))
        return result

    async def dispatch(self, prefixed_name: str, args: dict) -> Any:
        """`<domain>__<tool>` 이름으로 dispatch. CallToolResult 반환."""
        if self._stack is None:
            raise PoolNotReadyError("start()를 먼저 호출하세요")
        try:
            domain, tool_name = parse_prefixed_name(prefixed_name)
        except PrefixError as e:
            raise KeyError(f"잘못된 tool 이름: {e}") from e
        session = self._sessions.get(domain)
        if session is None:
            available = list(self._sessions.keys())
            raise KeyError(
                f"도메인 '{domain}'은 풀에 없습니다 (available={available})"
            )
        return await session.call_tool(tool_name, args)

    def health(self) -> dict:
        return {
            "ready_domains": list(self._sessions.keys()),
            "failed_domains": dict(self._failed_domains),
            "tool_count": sum(len(v) for v in self._tools_by_domain.values()),
        }

    async def close(self) -> None:
        if self._stack is not None:
            try:
                await self._stack.__aexit__(None, None, None)
            except Exception as e:
                logger.warning("pool close 중 예외: %s", e)
            finally:
                self._stack = None
                self._sessions.clear()
                self._tools_by_domain.clear()
