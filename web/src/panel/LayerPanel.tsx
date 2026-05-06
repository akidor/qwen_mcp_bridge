import { useState } from "react";
import {
  BasemapKind,
  BASEMAP_ORDER,
  setTerrainEnabled as applyTerrain,
  setBuildingsEnabled as applyBuildings,
} from "../map/basemaps";
import { toggleLayer, fitToBbox } from "../map/auto_layer";
import { getChartSpec, ChartSpec } from "../charts/auto_chart";
import ChartModal from "../charts/ChartModal";

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

const DOMAIN_INFO: Record<string, { icon: string; label: string }> = {
  locate: { icon: "📍", label: "Locate" },
  inspect: { icon: "🏛️", label: "Inspect" },
  reach: { icon: "🚶", label: "Reach" },
  analyze: { icon: "📐", label: "Analyze" },
  simulate: { icon: "☀️", label: "Simulate" },
  estimate: { icon: "💰", label: "Estimate" },
  design: { icon: "🏗️", label: "Design" },
  export: { icon: "📤", label: "Export" },
};

const STATIC_OVERLAYS = [
  { id: "parcel", label: "필지 (gus:parcel)" },
  { id: "building", label: "건물 (gus_3dsim:...)" },
  { id: "eum_aa", label: "용도지역 (eum_aa)" },
  { id: "eum_ab", label: "용도지구 (eum_ab)" },
  { id: "eum_ac", label: "용도구역 (eum_ac)" },
];

export default function LayerPanel(props: LayerPanelProps) {
  const [open, setOpen] = useState(false);
  const [modalSpec, setModalSpec] = useState<ChartSpec | null>(null);

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

  function domainOf(name: string): string {
    const idx = name.indexOf("__");
    return idx > 0 ? name.slice(0, idx) : "기타";
  }

  function handleVisibility(layerId: string) {
    const newVisible = !(props.layerVisibility[layerId] ?? true);
    props.setLayerVisibility({ ...props.layerVisibility, [layerId]: newVisible });
    if (props.map) toggleLayer(props.map, layerId, newVisible);
  }

  function handleZoom(bbox: [number, number, number, number]) {
    if (props.map) fitToBbox(props.map, bbox);
  }

  function handleChart(name: string, resultText: string) {
    const spec = getChartSpec(name, resultText);
    if (spec) setModalSpec(spec);
  }

  // toolHistory를 도메인별 layer + chart-only로 분류
  const layerDomains: Record<string, ToolHistoryEntry[]> = {};
  const chartItems: ToolHistoryEntry[] = [];

  for (const h of props.toolHistory) {
    const isChartable = h.resultText ? !!getChartSpec(h.name, h.resultText) : false;
    if (h.layerId) {
      const d = domainOf(h.name);
      if (!layerDomains[d]) layerDomains[d] = [];
      layerDomains[d].push(h);
    } else if (isChartable && h.resultText) {
      chartItems.push(h);
    }
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

        {/* 도구 결과 */}
        <div className="layer-section">
          <div className="layer-section-title">🔍 도구 결과</div>
          {Object.keys(layerDomains).length === 0 ? (
            <div className="layer-section-placeholder">아직 도구 호출 없음</div>
          ) : (
            Object.entries(layerDomains).map(([domain, items]) => {
              const info = DOMAIN_INFO[domain] ?? { icon: "📦", label: domain };
              return (
                <details key={domain} className="tree-folder" open>
                  <summary>
                    {info.icon} {info.label} ({items.length})
                  </summary>
                  <ul className="tree-children">
                    {items.map((h) => {
                      const visible = props.layerVisibility[h.layerId!] ?? true;
                      return (
                        <li key={h.layerId} className="tree-item">
                          <label className="tree-item-label">
                            <input
                              type="checkbox"
                              checked={visible}
                              onChange={() => handleVisibility(h.layerId!)}
                            />
                            <span className="tree-item-name" title={h.message}>{h.layerId}</span>
                          </label>
                          <div className="tree-item-actions">
                            {h.bbox ? (
                              <button onClick={() => handleZoom(h.bbox!)} title="줌">🎯</button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              );
            })
          )}
        </div>

        {/* 차트 섹션 */}
        <div className="layer-section">
          <div className="layer-section-title">📊 차트</div>
          {chartItems.length === 0 ? (
            <div className="layer-section-placeholder">차트 가능 도구 호출 없음</div>
          ) : (
            <ul className="tree-children">
              {chartItems.map((h, i) => (
                <li key={`${h.ts}-${i}`} className="tree-item">
                  <span className="tree-item-name" title={h.message}>{h.name}</span>
                  <div className="tree-item-actions">
                    <button onClick={() => handleChart(h.name, h.resultText!)} title="차트">📊</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 정적 Overlay placeholder */}
        <div className="layer-section">
          <div className="layer-section-title">🔌 정적 Overlay</div>
          <ul className="tree-children disabled">
            {STATIC_OVERLAYS.map((o) => (
              <li
                key={o.id}
                className="tree-item disabled"
                title="Geoserver WMS proxy 필요. 12차에서 활성화 예정."
              >
                <span className="tree-item-name">⊘ {o.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <ChartModal spec={modalSpec} onClose={() => setModalSpec(null)} />
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
