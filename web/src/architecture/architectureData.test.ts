import { describe, expect, it } from "vitest";

import {
  ARCH_LINKS,
  ARCH_NODES,
  MAP_RENDERER_NODE_IDS,
  MCP_POOL_NODE_IDS,
  nodeById,
} from "./architectureData";

describe("architecture data", () => {
  it("models the map renderer as a detailed frontend rendering pipeline", () => {
    expect(MAP_RENDERER_NODE_IDS).toEqual([
      "toolResultParser",
      "intentVisualFilter",
      "mapFailureGuards",
      "autoLayerManager",
      "popupCardBuilder",
      "viewportController",
      "mapState",
    ]);

    for (const id of MAP_RENDERER_NODE_IDS) {
      const node = nodeById(id);
      expect(node.kind).toBe("render");
      expect(node.details.length).toBeGreaterThanOrEqual(2);
    }

    const linkSet = new Set(ARCH_LINKS.map((link) => `${link.from}->${link.to}`));
    for (const requiredLink of [
      "web->toolResultParser",
      "toolResultParser->intentVisualFilter",
      "intentVisualFilter->mapFailureGuards",
      "mapFailureGuards->autoLayerManager",
      "autoLayerManager->popupCardBuilder",
      "autoLayerManager->viewportController",
      "autoLayerManager->mapState",
      "popupCardBuilder->map",
      "viewportController->map",
      "mapState->map",
    ]) {
      expect(linkSet.has(requiredLink)).toBe(true);
    }

    expect(nodeById("map").details.join(" ")).toContain("applyToolResult");
    expect(ARCH_NODES.filter((node) => node.kind === "render").length).toBeGreaterThanOrEqual(8);
  });

  it("models the MCP pool as a spawn, catalog, dispatch, coerce, health pipeline", () => {
    expect(MCP_POOL_NODE_IDS).toEqual([
      "poolToolCatalog",
      "poolDomainSpawner",
      "poolDispatchRouter",
      "poolArgCoercer",
      "poolHealthMonitor",
      "poolUiTools",
    ]);

    for (const id of MCP_POOL_NODE_IDS) {
      const node = nodeById(id);
      expect(node.kind).toBe("tooling");
      expect(node.details.length).toBeGreaterThanOrEqual(2);
    }

    const linkSet = new Set(ARCH_LINKS.map((link) => `${link.from}->${link.to}`));
    for (const requiredLink of [
      "pool->poolToolCatalog",
      "poolToolCatalog->qwen",
      "pool->poolDomainSpawner",
      "poolDomainSpawner->locate",
      "poolDomainSpawner->analyze",
      "loop->poolDispatchRouter",
      "poolDispatchRouter->poolArgCoercer",
      "poolArgCoercer->pool",
      "pool->poolHealthMonitor",
      "poolUiTools->web",
    ]) {
      expect(linkSet.has(requiredLink)).toBe(true);
    }

    expect(nodeById("pool").details.join(" ")).toContain("dispatch");
    expect(nodeById("poolArgCoercer").details.join(" ")).toContain("_coerce_args");
  });
});
