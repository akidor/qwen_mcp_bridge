import { describe, expect, it } from "vitest";

import { ARCH_CLUSTERS, ARCH_LINKS, ARCH_NODES } from "./architectureData";
import { analyzeArchitectureGraph, summarizeSuggestedLinkReviews } from "./architectureGraph";

describe("architecture graph connectivity analysis", () => {
  it("separates intentional source/sink/guard nodes from weakly connected processors", () => {
    const report = analyzeArchitectureGraph(ARCH_NODES, ARCH_LINKS, ARCH_CLUSTERS);

    expect(report.invalidLinks).toEqual([]);
    expect(report.isolatedNodes).toEqual([]);

    expect(report.nodeStatusById.user.severity).toBe("ok");
    expect(report.nodeStatusById.statsDetector.severity).toBe("ok");
    expect(report.nodeStatusById.followupContext.severity).toBe("ok");
    expect(report.nodeStatusById.routingScenarioTests.severity).toBe("ok");
    expect(report.nodeStatusById.poolHealthMonitor.severity).toBe("ok");
    expect(report.nodeStatusById.map.severity).toBe("ok");
    expect(report.nodeStatusById.polygon.severity).toBe("ok");

    expect(report.nodeStatusById.design.severity).toBe("weak");
    expect(report.nodeStatusById.design.reasons.join(" ")).toContain("outbound");
    expect(report.summary.weakNodeIds).toContain("design");
    expect(report.summary.weakNodeIds).toContain("otherDomains");
  });

  it("flags clusters that have too few external boundary links", () => {
    const report = analyzeArchitectureGraph(ARCH_NODES, ARCH_LINKS, ARCH_CLUSTERS);
    const rendering = report.clusterStatusById.rendering;
    const mcpPool = report.clusterStatusById["mcp-pool"];

    expect(rendering).toBeDefined();
    expect(rendering?.severity).toBe("weak");
    expect(rendering?.boundary).toBe(1);
    expect(rendering?.reasons.join(" ")).toContain("boundary");

    expect(mcpPool).toBeDefined();
    expect(mcpPool?.severity).toBe("ok");
    expect(mcpPool?.boundary).toBeGreaterThanOrEqual(2);
    expect(report.summary.weakClusterIds).toEqual(["rendering"]);
  });

  it("recommends concrete links that would improve weak nodes and cluster boundaries", () => {
    const report = analyzeArchitectureGraph(ARCH_NODES, ARCH_LINKS, ARCH_CLUSTERS);

    expect(report.suggestedLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "design",
          to: "polygon",
          source: "weak-node",
          confidence: "medium",
          curve: expect.any(Number),
        }),
        expect.objectContaining({
          from: "map",
          to: "web",
          source: "weak-cluster",
          confidence: "high",
          curve: expect.any(Number),
        }),
      ]),
    );
    expect(report.suggestedLinks.map((link) => link.id)).toEqual(["design->polygon", "otherDomains->polygon", "map->web"]);
    expect(report.summary.suggestedLinkCount).toBe(report.suggestedLinks.length);
    expect(report.suggestedLinks.some((link) => link.from === "analyze" && link.to === "polygon")).toBe(false);
  });

  it("summarizes suggested link review states and keeps ignored links out of preview", () => {
    const report = analyzeArchitectureGraph(ARCH_NODES, ARCH_LINKS, ARCH_CLUSTERS);

    const emptyReview = summarizeSuggestedLinkReviews(report.suggestedLinks, {});
    expect(emptyReview).toEqual({
      pending: report.suggestedLinks.length,
      planned: 0,
      ignored: 0,
      visibleSuggestionIds: report.suggestedLinks.map((suggestion) => suggestion.id),
    });

    const reviewed = summarizeSuggestedLinkReviews(report.suggestedLinks, {
      "design->polygon": "planned",
      "map->web": "ignored",
    });

    expect(reviewed.pending).toBe(1);
    expect(reviewed.planned).toBe(1);
    expect(reviewed.ignored).toBe(1);
    expect(reviewed.visibleSuggestionIds).toEqual(["design->polygon", "otherDomains->polygon"]);
  });
});
