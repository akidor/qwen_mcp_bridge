import type { ArchCluster, ArchLink, ArchNode, ClusterId, ConnectivityRole } from "./architectureData";

export type ConnectivitySeverity = "ok" | "weak" | "broken";

export interface LinkEndpointIssue {
  from: string;
  to: string;
  label: string;
  reason: string;
}

export interface NodeConnectivityStatus {
  id: string;
  label: string;
  cluster: ClusterId;
  role: ConnectivityRole;
  inbound: number;
  outbound: number;
  total: number;
  crossInbound: number;
  crossOutbound: number;
  severity: ConnectivitySeverity;
  reasons: string[];
}

export interface ClusterConnectivityStatus {
  id: ClusterId;
  label: string;
  nodes: number;
  internal: number;
  inbound: number;
  outbound: number;
  boundary: number;
  severity: ConnectivitySeverity;
  reasons: string[];
}

export interface ArchitectureConnectivityReport {
  nodeStatusById: Record<string, NodeConnectivityStatus>;
  clusterStatusById: Partial<Record<ClusterId, ClusterConnectivityStatus>>;
  invalidLinks: LinkEndpointIssue[];
  isolatedNodes: string[];
  summary: {
    weakNodeIds: string[];
    brokenNodeIds: string[];
    weakClusterIds: ClusterId[];
    brokenClusterIds: ClusterId[];
    issueCount: number;
  };
}

const ROLE_MINIMUMS: Record<ConnectivityRole, { inbound: number; outbound: number }> = {
  source: { inbound: 0, outbound: 1 },
  sink: { inbound: 1, outbound: 0 },
  processor: { inbound: 1, outbound: 1 },
  guard: { inbound: 0, outbound: 1 },
  diagnostic: { inbound: 1, outbound: 0 },
};

function nodeRole(node: ArchNode): ConnectivityRole {
  return node.connectivityRole ?? "processor";
}

function nodeSeverity(total: number, reasons: string[]): ConnectivitySeverity {
  if (total === 0) return "broken";
  return reasons.length > 0 ? "weak" : "ok";
}

export function analyzeArchitectureGraph(
  nodes: readonly ArchNode[],
  links: readonly ArchLink[],
  clusters: readonly ArchCluster[],
): ArchitectureConnectivityReport {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const degreeById = new Map(
    nodes.map((node) => [
      node.id,
      {
        inbound: 0,
        outbound: 0,
        crossInbound: 0,
        crossOutbound: 0,
      },
    ]),
  );
  const invalidLinks: LinkEndpointIssue[] = [];

  for (const link of links) {
    const from = nodeById.get(link.from);
    const to = nodeById.get(link.to);
    if (!from || !to) {
      invalidLinks.push({
        from: link.from,
        to: link.to,
        label: link.label,
        reason: !from && !to ? "missing from/to endpoints" : !from ? "missing from endpoint" : "missing to endpoint",
      });
      continue;
    }

    const fromDegree = degreeById.get(from.id);
    const toDegree = degreeById.get(to.id);
    if (!fromDegree || !toDegree) continue;

    fromDegree.outbound += 1;
    toDegree.inbound += 1;
    if (from.cluster !== to.cluster) {
      fromDegree.crossOutbound += 1;
      toDegree.crossInbound += 1;
    }
  }

  const nodeStatusById: Record<string, NodeConnectivityStatus> = {};
  for (const node of nodes) {
    const degree = degreeById.get(node.id);
    const inbound = degree?.inbound ?? 0;
    const outbound = degree?.outbound ?? 0;
    const role = nodeRole(node);
    const minimum = ROLE_MINIMUMS[role];
    const reasons: string[] = [];

    if (inbound < minimum.inbound) reasons.push(`inbound ${inbound} is below ${minimum.inbound}`);
    if (outbound < minimum.outbound) reasons.push(`outbound ${outbound} is below ${minimum.outbound}`);

    const total = inbound + outbound;
    if (total === 0) reasons.unshift("isolated node");

    nodeStatusById[node.id] = {
      id: node.id,
      label: node.label,
      cluster: node.cluster,
      role,
      inbound,
      outbound,
      total,
      crossInbound: degree?.crossInbound ?? 0,
      crossOutbound: degree?.crossOutbound ?? 0,
      severity: nodeSeverity(total, reasons),
      reasons,
    };
  }

  const clusterStatusById: Partial<Record<ClusterId, ClusterConnectivityStatus>> = {};
  for (const cluster of clusters) {
    const clusterNodes = nodes.filter((node) => node.cluster === cluster.id);
    let internal = 0;
    let inbound = 0;
    let outbound = 0;

    for (const link of links) {
      const from = nodeById.get(link.from);
      const to = nodeById.get(link.to);
      if (!from || !to) continue;

      if (from.cluster === cluster.id && to.cluster === cluster.id) internal += 1;
      else if (from.cluster === cluster.id) outbound += 1;
      else if (to.cluster === cluster.id) inbound += 1;
    }

    const boundary = inbound + outbound;
    const reasons: string[] = [];
    let severity: ConnectivitySeverity = "ok";

    if (clusterNodes.length === 0) {
      severity = "broken";
      reasons.push("cluster has no nodes");
    } else if (clusterNodes.length > 1 && boundary < 2) {
      severity = "weak";
      reasons.push(`boundary ${boundary} is below 2`);
    }

    clusterStatusById[cluster.id] = {
      id: cluster.id,
      label: cluster.label,
      nodes: clusterNodes.length,
      internal,
      inbound,
      outbound,
      boundary,
      severity,
      reasons,
    };
  }

  const isolatedNodes = Object.values(nodeStatusById)
    .filter((status) => status.total === 0)
    .map((status) => status.id);
  const weakNodeIds = Object.values(nodeStatusById)
    .filter((status) => status.severity === "weak")
    .map((status) => status.id);
  const brokenNodeIds = Object.values(nodeStatusById)
    .filter((status) => status.severity === "broken")
    .map((status) => status.id);
  const weakClusterIds = Object.values(clusterStatusById)
    .filter((status): status is ClusterConnectivityStatus => Boolean(status) && status.severity === "weak")
    .map((status) => status.id);
  const brokenClusterIds = Object.values(clusterStatusById)
    .filter((status): status is ClusterConnectivityStatus => Boolean(status) && status.severity === "broken")
    .map((status) => status.id);

  return {
    nodeStatusById,
    clusterStatusById,
    invalidLinks,
    isolatedNodes,
    summary: {
      weakNodeIds,
      brokenNodeIds,
      weakClusterIds,
      brokenClusterIds,
      issueCount: invalidLinks.length + weakNodeIds.length + brokenNodeIds.length + weakClusterIds.length + brokenClusterIds.length,
    },
  };
}
