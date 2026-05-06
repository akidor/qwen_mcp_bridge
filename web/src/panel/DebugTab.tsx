import { toggleLayer, fitToBbox } from "../map/auto_layer";

interface ToolHistoryEntry {
  name: string;
  ts: number;
  layerId: string | null;
  message: string;
  bbox?: [number, number, number, number];
}

interface DebugTabProps {
  map: any;
  lastChunk: unknown;
  toolHistory: ToolHistoryEntry[];
  layerVisibility: Record<string, boolean>;
  setLayerVisibility: (next: Record<string, boolean>) => void;
}

export default function DebugTab({ map, lastChunk, toolHistory, layerVisibility, setLayerVisibility }: DebugTabProps) {
  function handleToggle(layerId: string) {
    const newVisible = !(layerVisibility[layerId] ?? true);
    setLayerVisibility({ ...layerVisibility, [layerId]: newVisible });
    if (map) toggleLayer(map, layerId, newVisible);
  }

  function handleZoom(bbox: [number, number, number, number]) {
    if (map) fitToBbox(map, bbox);
  }

  return (
    <div className="debug-tab">
      <div className="field">
        <label>활성 layer ({toolHistory.filter((h) => h.layerId).length})</label>
        <ul className="layer-list">
          {toolHistory.length === 0 ? (
            <li className="empty">아직 도구 호출 없음</li>
          ) : (
            toolHistory.map((h, i) => (
              <li key={`${h.ts}-${i}`} className="layer-item">
                <span className="layer-name">{h.name}</span>
                <span className="layer-msg">{h.message}</span>
                {h.layerId ? (
                  <div className="layer-actions">
                    <button onClick={() => handleToggle(h.layerId!)}>
                      {layerVisibility[h.layerId] ?? true ? "숨김" : "보임"}
                    </button>
                    {h.bbox ? (
                      <button onClick={() => handleZoom(h.bbox!)}>줌</button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="field">
        <label>마지막 SSE chunk</label>
        <pre className="json-box">
          {lastChunk ? JSON.stringify(lastChunk, null, 2) : "응답 없음"}
        </pre>
      </div>
    </div>
  );
}
