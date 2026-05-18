import { describe, expect, it } from "vitest";

import { ARCH_CLUSTERS, ARCH_LINKS, ARCH_NODES } from "./architectureData";
import { analyzeArchitectureGraph } from "./architectureGraph";

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
});
