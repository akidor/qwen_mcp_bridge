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

  const visual = [
    debug.visualRequired ? `required: ${debug.visualRequired}` : "",
    debug.visualSuppress ? `suppress: ${debug.visualSuppress}` : "",
  ].filter(Boolean).join(" · ");
  if (visual) rows.push({ label: "visual", value: visual });
  if (debug.answerMode) rows.push({ label: "answer mode", value: debug.answerMode });
  if (debug.answerGuard) rows.push({ label: "answer guard", value: debug.answerGuard });

  return rows;
}

function textOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
