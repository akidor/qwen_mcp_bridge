import { useState } from "react";
import { BasemapKind } from "../map/basemaps";

interface ToolHistoryEntry {
  name: string;
  ts: number;
  layerId: string | null;
  message: string;
  bbox?: [number, number, number, number];
  resultText?: string;
}

interface LayerPanelProps {
  map: any;
  basemap: BasemapKind;
  setBasemap: (b: BasemapKind) => void;
  terrainEnabled: boolean;
  setTerrainEnabled: (v: boolean) => void;
  buildingsEnabled: boolean;
  setBuildingsEnabled: (v: boolean) => void;
  toolHistory: ToolHistoryEntry[];
  layerVisibility: Record<string, boolean>;
  setLayerVisibility: (next: Record<string, boolean>) => void;
  layerOpacity: Record<string, number>;
  setLayerOpacity: (next: Record<string, number>) => void;
}

export default function LayerPanel(_props: LayerPanelProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        className="layer-panel-button"
        onClick={() => setOpen(true)}
        aria-label="레이어 열기"
        title="레이어"
      >
        🗂️
      </button>
    );
  }

  return (
    <div className="layer-panel">
      <div className="layer-panel-header">
        <span>레이어</span>
        <button
          className="layer-panel-close"
          onClick={() => setOpen(false)}
          aria-label="닫기"
        >
          ✕
        </button>
      </div>
      <div className="layer-panel-body">
        <p style={{ fontSize: 12, color: "var(--fg-muted)" }}>
          T2~T4에서 트리 컨텐츠 채워짐.
        </p>
      </div>
    </div>
  );
}
