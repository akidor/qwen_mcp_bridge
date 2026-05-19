import { describe, expect, it } from "vitest";

import {
  ARCH_CLUSTERS,
  ARCH_LINKS,
  ARCH_NODES,
  CHAT_OBSERVABILITY_NODE_IDS,
  MAP_RENDERER_NODE_IDS,
  MCP_POOL_NODE_IDS,
  QUERY_ROUTING_NODE_IDS,
  TOPOLOGY_CLUSTER_IDS,
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
    expect(nodeById("autoLayerManager").details.join(" ")).toContain("existing_building_statistics");
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

  it("models query understanding as anchor, intent, follow-up, hint, and eval layers", () => {
    expect(QUERY_ROUTING_NODE_IDS).toEqual([
      "anchorExtractor",
      "intentClassifier",
      "statsDetector",
      "followupContext",
      "routingHintBuilder",
      "routingScenarioTests",
    ]);

    for (const id of QUERY_ROUTING_NODE_IDS) {
      const node = nodeById(id);
      expect(node.kind).toBe("policy");
      expect(node.details.length).toBeGreaterThanOrEqual(2);
    }

    const linkSet = new Set(ARCH_LINKS.map((link) => `${link.from}->${link.to}`));
    for (const requiredLink of [
      "bridge->anchorExtractor",
      "anchorExtractor->intentClassifier",
      "statsDetector->intentClassifier",
      "followupContext->routingHintBuilder",
      "intentClassifier->routingHintBuilder",
      "routingHintBuilder->policy",
      "routingScenarioTests->routingHintBuilder",
      "intentClassifier->web",
    ]) {
      expect(linkSet.has(requiredLink)).toBe(true);
    }

    expect(nodeById("anchorExtractor").details.join(" ")).toContain("_JIBUN_RE");
    expect(nodeById("followupContext").details.join(" ")).toContain("시각화만");
    expect(nodeById("routingHintBuilder").details.join(" ")).toContain("build_routing_hint");
    expect(nodeById("analyze").details.join(" ")).toContain("distance_from_center");
    expect(nodeById("analyze").details.join(" ")).toContain("detail_concurrency");
    expect(nodeById("polygon").details.join(" ")).toContain("/api/parcels/details");
    expect(nodeById("loop").details.join(" ")).toContain("stats-only");
    expect(nodeById("loop").details.join(" ")).toContain("tool_result_page");
    expect(nodeById("toolResultParser").details.join(" ")).toContain("GeoJSON-only");
    expect(nodeById("toolResultParser").details.join(" ")).toContain("paged FeatureCollection");
  });

  it("models chat routing debug metadata and current parcel context as visible observability paths", () => {
    expect(CHAT_OBSERVABILITY_NODE_IDS).toEqual(["routingDebugPanel", "currentParcelContext"]);

    const panel = nodeById("routingDebugPanel");
    expect(panel.kind).toBe("interface");
    expect(panel.cluster).toBe("interface");
    expect(panel.details.join(" ")).toContain("routing_debug");
    const context = nodeById("currentParcelContext");
    expect(context.kind).toBe("interface");
    expect(context.cluster).toBe("interface");
    expect(context.details.join(" ")).toContain("metadata.current_parcel");

    const linkSet = new Set(ARCH_LINKS.map((link) => `${link.from}->${link.to}`));
    for (const requiredLink of [
      "routingHintBuilder->routingDebugPanel",
      "loop->routingDebugPanel",
      "routingDebugPanel->web",
      "popupCardBuilder->currentParcelContext",
      "currentParcelContext->bridge",
      "currentParcelContext->routingDebugPanel",
    ]) {
      expect(linkSet.has(requiredLink)).toBe(true);
    }
  });

  it("groups every node into a togglable architecture layer", () => {
    expect(TOPOLOGY_CLUSTER_IDS).toEqual([
      "interface",
      "bridge",
      "routing",
      "model",
      "tool-loop",
      "mcp-pool",
      "domains",
      "data",
      "rendering",
    ]);

    const clusterIds = new Set(ARCH_CLUSTERS.map((cluster) => cluster.id));
    for (const id of TOPOLOGY_CLUSTER_IDS) {
      expect(clusterIds.has(id)).toBe(true);
    }

    for (const node of ARCH_NODES) {
      expect(clusterIds.has(node.cluster)).toBe(true);
    }

    expect(nodeById("routingHintBuilder").cluster).toBe("routing");
    expect(nodeById("poolArgCoercer").cluster).toBe("mcp-pool");
    expect(nodeById("autoLayerManager").cluster).toBe("rendering");
  });
});
