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


def _coerce_args(args: dict, schema: dict | None) -> dict:
    """Qwen이 정수/실수/불리언 인자를 문자열로 따옴표 처리해 보낼 때 schema 보고 자동 변환.

    JSON Schema의 properties에서 type이 'integer' / 'number' / 'boolean'을 포함하면
    string 입력을 시도적으로 cast. 변환 실패하면 원본 유지.
    """
    if not isinstance(args, dict) or not schema:
        return args
    props = schema.get("properties") or {}
    if not isinstance(props, dict):
        return args
    out = dict(args)
    for key, value in args.items():
        if not isinstance(value, str):
            continue
        prop_def = props.get(key)
        if not isinstance(prop_def, dict):
            continue
        types = prop_def.get("type")
        allowed = set(types) if isinstance(types, list) else ({types} if types else set())
        if "integer" in allowed:
            try:
                out[key] = int(value)
                continue
            except (TypeError, ValueError):
                pass
        if "number" in allowed:
            try:
                out[key] = float(value)
                continue
            except (TypeError, ValueError):
                pass
        if "boolean" in allowed:
            v = value.lower()
            if v in {"true", "1", "yes"}:
                out[key] = True
            elif v in {"false", "0", "no"}:
                out[key] = False
    return out


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
        """stdio MCP 도구 + in-process ui 도구를 합쳐 OpenAI 형식으로 반환."""
        from qwen_mcp_bridge.ui_tools import list_ui_openai_tools
        result: list[dict] = []
        for domain, tools in self._tools_by_domain.items():
            for t in tools:
                result.append(mcp_tool_to_openai(t, domain))
        result.extend(list_ui_openai_tools())
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
        # Qwen은 종종 정수/실수 인자를 문자열로 따옴표 처리해 보냄 ("5" 대신 5).
        # 도구의 inputSchema와 비교해 안전한 coerce 적용.
        schema = self._tool_schema(domain, tool_name)
        coerced = _coerce_args(args, schema)
        return await session.call_tool(tool_name, coerced)

    def _tool_schema(self, domain: str, tool_name: str) -> dict | None:
        for t in self._tools_by_domain.get(domain) or []:
            if getattr(t, "name", None) == tool_name:
                return getattr(t, "inputSchema", None)
        return None

    def health(self) -> dict:
        from qwen_mcp_bridge.ui_tools import UI_TOOLS
        stdio_count = sum(len(v) for v in self._tools_by_domain.values())
        return {
            "ready_domains": list(self._sessions.keys()),
            "failed_domains": dict(self._failed_domains),
            "tool_count": stdio_count + len(UI_TOOLS),
            "stdio_tool_count": stdio_count,
            "ui_tool_count": len(UI_TOOLS),
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
