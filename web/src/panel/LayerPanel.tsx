import { useState } from "react";
import { BasemapKind } from "../map/basemaps";
import type { WmsTreeNode } from "../wms/types";
import { getChartSpec, ChartSpec } from "../charts/auto_chart";
import ChartModal from "../charts/ChartModal";
import LayerPanelBody from "./LayerPanelBody";
import type { DrawnFeature } from "./DrawnFeatures";

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
  wmsTree: WmsTreeNode[];
  wmsTreeError: string | null;
  wmsTreeLoading: boolean;
  selectedWmsKeys: Set<string>;
  setSelectedWmsKeys: (next: Set<string>) => void;
  wmsOpacity: Record<string, number>;
  setWmsOpacity: (next: Record<string, number>) => void;
  onReloadWmsTree: () => void;
  drawEnabled: boolean;
  setDrawEnabled: (v: boolean) => void;
  drawnFeatures: DrawnFeature[];
  toggleDrawnFeatureVisible: (id: string) => void;
  removeDrawnFeature: (id: string) => void;
}

export default function LayerPanel(props: LayerPanelProps) {
  const [open, setOpen] = useState(false);
  const [modalSpec, setModalSpec] = useState<ChartSpec | null>(null);

  function handleChart(name: string, resultText: string) {
    const spec = getChartSpec(name, resultText);
    if (spec) setModalSpec(spec);
  }

  if (!open) {
    return (
      <button
        className="layer-panel-button"
        onClick={() => setOpen(true)}
        aria-label="레이어 열기"
        title="레이어"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
          <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
          <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
        </svg>
        레이어
      </button>
    );
  }

  return (
    <div className="layer-panel">
      <div className="layer-panel-header">
        <span>레이어</span>
        <button className="layer-panel-close" onClick={() => setOpen(false)} aria-label="닫기">
          ✕
        </button>
      </div>
      <LayerPanelBody {...props} onChartClick={handleChart} />
      <ChartModal spec={modalSpec} onClose={() => setModalSpec(null)} />
    </div>
  );
}
