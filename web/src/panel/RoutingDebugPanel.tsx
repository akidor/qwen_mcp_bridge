import type { ToolEvent } from "./ChatTab";
import { buildRoutingDebugRows, type RoutingDebugMeta } from "./routingDebug";

type RoutingDebugPanelProps = {
  debug: RoutingDebugMeta;
  toolEvents?: ToolEvent[];
  expanded: boolean;
  onToggle: () => void;
};

export default function RoutingDebugPanel({ debug, toolEvents, expanded, onToggle }: RoutingDebugPanelProps) {
  const rows = buildRoutingDebugRows(debug, toolEvents);
  return (
    <div className="routing-debug-block">
      <button type="button" className="routing-debug-summary" onClick={onToggle}>
        <span className="routing-debug-badge">routing</span>
        <span className="routing-debug-title">{debug.intent}</span>
        {debug.bucket ? <span className="routing-debug-bucket">{debug.bucket}</span> : null}
        <span className="routing-debug-toggle">{expanded ? "접기" : "보기"}</span>
      </button>
      {expanded ? (
        <div className="routing-debug-detail">
          <dl>
            {rows.map((row) => (
              <div key={row.label}>
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
