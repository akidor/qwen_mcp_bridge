export type RoutingDebugMeta = {
  intent: string;
  bucket?: string;
  anchorType?: string;
  anchorText?: string;
  requiredChain?: string;
  radiusM?: string;
  visualRequired?: string;
  visualSuppress?: string;
  answerMode?: string;
  answerGuard?: string;
  routingHint: string;
};

export type RoutingDebugToolEvent = {
  kind: string;
  name: string;
  error?: boolean;
};

export type RoutingDebugRow = {
  label: string;
  value: string;
};

export type RoutingDebugChainStatus =
  | {
      status: "ok";
      expectedTools: string[];
      actualTools: string[];
    }
  | {
      status: "missing";
      expectedTools: string[];
      actualTools: string[];
      missingTools: string[];
      badge: string;
      message: string;
    }
  | {
      status: "order_mismatch";
      expectedTools: string[];
      actualTools: string[];
      badge: string;
      message: string;
    };

export function routingDebugFromEvent(data: any): RoutingDebugMeta {
  return {
    intent: String(data?.intent ?? "unknown"),
    bucket: textOrUndefined(data?.bucket),
    anchorType: textOrUndefined(data?.anchor_type),
    anchorText: textOrUndefined(data?.anchor_text),
    requiredChain: textOrUndefined(data?.required_chain),
    radiusM: textOrUndefined(data?.radius_m),
    visualRequired: textOrUndefined(data?.visual_required),
    visualSuppress: textOrUndefined(data?.visual_suppress),
    answerMode: textOrUndefined(data?.answer_mode),
    answerGuard: textOrUndefined(data?.answer_guard),
    routingHint: String(data?.routing_hint ?? ""),
  };
}

export function buildRoutingDebugRows(
  debug: RoutingDebugMeta,
  toolEvents: readonly RoutingDebugToolEvent[] | undefined,
): RoutingDebugRow[] {
  const chainStatus = getRoutingDebugChainStatus(debug, toolEvents);
  const rows: RoutingDebugRow[] = [
    { label: "intent", value: debug.intent },
  ];
  if (debug.bucket) rows.push({ label: "bucket", value: debug.bucket });
  if (debug.anchorType || debug.anchorText) rows.push({ label: "anchor", value: [debug.anchorType, debug.anchorText].filter(Boolean).join(" · ") });
  if (debug.radiusM) rows.push({ label: "radius", value: `${debug.radiusM}m` });
  if (debug.requiredChain) rows.push({ label: "required chain", value: debug.requiredChain });

  const actualTools = (toolEvents ?? [])
    .filter((event) => event.kind === "end")
    .map((event) => `${event.error ? "!" : ""}${event.name}`);
  rows.push({ label: "actual tools", value: actualTools.length ? actualTools.join(" -> ") : "none" });
  if (chainStatus.status !== "ok") rows.push({ label: "chain warning", value: chainStatus.message });

  const visual = [
    debug.visualRequired ? `required: ${debug.visualRequired}` : "",
    debug.visualSuppress ? `suppress: ${debug.visualSuppress}` : "",
  ].filter(Boolean).join(" · ");
  if (visual) rows.push({ label: "visual", value: visual });
  if (debug.answerMode) rows.push({ label: "answer mode", value: debug.answerMode });
  if (debug.answerGuard) rows.push({ label: "answer guard", value: debug.answerGuard });

  return rows;
}

export function getRoutingDebugChainStatus(
  debug: RoutingDebugMeta,
  toolEvents: readonly RoutingDebugToolEvent[] | undefined,
): RoutingDebugChainStatus {
  const expectedTools = parseRequiredChain(debug.requiredChain);
  const actualTools = completedToolNames(toolEvents);
  if (expectedTools.length === 0 || containsChainInOrder(expectedTools, actualTools)) {
    return { status: "ok", expectedTools, actualTools };
  }

  const missingTools = missingRequiredTools(expectedTools, actualTools);
  if (missingTools.length > 0) {
    return {
      status: "missing",
      expectedTools,
      actualTools,
      missingTools,
      badge: "missing tool",
      message: `missing required ${missingTools.length === 1 ? "tool" : "tools"}: ${missingTools.join(", ")}`,
    };
  }

  return {
    status: "order_mismatch",
    expectedTools,
    actualTools,
    badge: "order mismatch",
    message: `order mismatch: expected ${expectedTools.join(" -> ")}; actual ${actualTools.join(" -> ") || "none"}`,
  };
}

function textOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseRequiredChain(requiredChain: string | undefined): string[] {
  if (!requiredChain) return [];
  return requiredChain
    .split(/\s*(?:->|→)\s*/)
    .flatMap((segment) => Array.from(segment.matchAll(/\b[a-z][a-z0-9]*__[A-Za-z_][A-Za-z0-9_]*\b/g), (match) => match[0]));
}

function completedToolNames(toolEvents: readonly RoutingDebugToolEvent[] | undefined): string[] {
  return (toolEvents ?? [])
    .filter((event) => event.kind === "end")
    .map((event) => event.name);
}

function containsChainInOrder(expectedTools: readonly string[], actualTools: readonly string[]): boolean {
  let expectedIndex = 0;
  for (const tool of actualTools) {
    if (tool === expectedTools[expectedIndex]) expectedIndex += 1;
    if (expectedIndex === expectedTools.length) return true;
  }
  return expectedIndex === expectedTools.length;
}

function missingRequiredTools(expectedTools: readonly string[], actualTools: readonly string[]): string[] {
  const remainingActualCounts = new Map<string, number>();
  for (const tool of actualTools) {
    remainingActualCounts.set(tool, (remainingActualCounts.get(tool) ?? 0) + 1);
  }

  const missing: string[] = [];
  for (const tool of expectedTools) {
    const remaining = remainingActualCounts.get(tool) ?? 0;
    if (remaining > 0) {
      remainingActualCounts.set(tool, remaining - 1);
      continue;
    }
    if (!missing.includes(tool)) missing.push(tool);
  }
  return missing;
}
