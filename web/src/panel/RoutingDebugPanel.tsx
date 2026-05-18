import {
  buildRoutingDebugRows,
  getRoutingDebugChainStatus,
  type RoutingDebugMeta,
  type RoutingDebugToolEvent,
} from "./routingDebug";

type RoutingDebugPanelProps = {
  debug: RoutingDebugMeta;
  toolEvents?: readonly RoutingDebugToolEvent[];
  expanded: boolean;
  onToggle: () => void;
};

export default function RoutingDebugPanel({ debug, toolEvents, expanded, onToggle }: RoutingDebugPanelProps) {
  const rows = buildRoutingDebugRows(debug, toolEvents);
  const chainStatus = getRoutingDebugChainStatus(debug, toolEvents);
  const warning = chainStatus.status === "ok" ? undefined : chainStatus;
  return (
    <div className={`routing-debug-block ${warning ? "has-warning" : ""}`}>
      <button type="button" className="routing-debug-summary" onClick={onToggle}>
        <span className="routing-debug-badge">routing</span>
        {warning ? <span className="routing-debug-warning-badge">{warning.badge}</span> : null}
        <span className="routing-debug-title">{debug.intent}</span>
        {debug.bucket ? <span className="routing-debug-bucket">{debug.bucket}</span> : null}
        <span className="routing-debug-toggle">{expanded ? "접기" : "보기"}</span>
      </button>
      {expanded ? (
        <div className="routing-debug-detail">
          <dl>
            {rows.map((row) => (
              <div key={row.label} className={row.label === "chain warning" ? "routing-debug-warning-row" : undefined}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          {debug.routingHint ? (
            <details className="routing-debug-raw">
              <summary>raw hint</summary>
              <pre>{debug.routingHint}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
