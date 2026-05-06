import { useState } from "react";
import {
  BasemapKind,
  BASEMAP_ORDER,
  setTerrainEnabled as applyTerrain,
  setBuildingsEnabled as applyBuildings,
} from "../map/basemaps";

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

export default function LayerPanel(props: LayerPanelProps) {
  const [open, setOpen] = useState(false);

  function handleTerrainToggle() {
    const next = !props.terrainEnabled;
    props.setTerrainEnabled(next);
    if (props.map) applyTerrain(props.map, next);
  }

  function handleBuildingsToggle() {
    const next = !props.buildingsEnabled;
    props.setBuildingsEnabled(next);
    if (props.map) applyBuildings(props.map, next);
  }

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
        {/* 배경지도 */}
        <div className="layer-section">
          <div className="layer-section-title">🗺️ 배경지도</div>
          <div className="layer-radio-list">
            {BASEMAP_ORDER.map((k) => (
              <label key={k} className={`layer-radio ${props.basemap === k ? "active" : ""}`}>
                <input
                  type="radio"
                  name="basemap"
                  checked={props.basemap === k}
                  onChange={() => props.setBasemap(k)}
                />
                <span>{basemapLabel(k)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 3D */}
        <div className="layer-section">
          <div className="layer-section-title">🏔️ 3D</div>
          <label className="layer-checkbox">
            <input
              type="checkbox"
              checked={props.terrainEnabled}
              onChange={handleTerrainToggle}
            />
            <span>3D 지형 (terrain + hillshade)</span>
          </label>
          <label className="layer-checkbox">
            <input
              type="checkbox"
              checked={props.buildingsEnabled}
              onChange={handleBuildingsToggle}
            />
            <span>3D 건물 (extrusion)</span>
          </label>
        </div>

        <div className="layer-section-placeholder">
          T3에서 도구 결과 트리, T4에서 opacity slider 추가.
        </div>
      </div>
    </div>
  );
}

function basemapLabel(k: BasemapKind): string {
  switch (k) {
    case "white": return "백지도";
    case "base": return "일반";
    case "satellite": return "위성";
    case "midnight": return "야간";
    case "hybrid": return "하이브리드";
  }
}
