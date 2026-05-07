import { useState, useEffect, useMemo } from "react";
import {
  BasemapKind,
  BASEMAP_ORDER,
  setTerrainEnabled as applyTerrain,
  setBuildingsEnabled as applyBuildings,
} from "../map/basemaps";
import { toggleLayer, fitToBbox, setLayerOpacity as applyLayerOpacity, hasFillLayer } from "../map/auto_layer";
import { addWmsLayer, removeWmsLayer, setWmsOpacity as applyWmsOpacity, hasWmsLayer } from "../map/auto_layer";
import WmsTreeNodeView from "./WmsTreeNode";
import type { WmsTreeNode } from "../wms/types";
import { getChartSpec, ChartSpec } from "../charts/auto_chart";
import ChartModal from "../charts/ChartModal";
import DrawnFeatures, { type DrawnFeature } from "./DrawnFeatures";

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

export default function LayerPanel(props: LayerPanelProps) {
  const [open, setOpen] = useState(false);
  const [modalSpec, setModalSpec] = useState<ChartSpec | null>(null);

  const wmsLayerInfo = useMemo(() => {
    const info = new Map<string, { layer: string; cqlFilter?: string }>();
    function walk(nodes: WmsTreeNode[]) {
      for (const n of nodes) {
        if (n.isLeaf && n.layer) info.set(n.id, { layer: n.layer, cqlFilter: n.cqlFilter });
        if (n.children.length) walk(n.children);
      }
    }
    walk(props.wmsTree);
    return info;
  }, [props.wmsTree]);

  useEffect(() => {
    if (!props.map) return;
    // 추가
    for (const key of props.selectedWmsKeys) {
      const info = wmsLayerInfo.get(key);
      if (info && !hasWmsLayer(props.map, key)) {
        addWmsLayer(props.map, key, info.layer, info.cqlFilter);
        const op = props.wmsOpacity[key];
        if (typeof op === "number") applyWmsOpacity(props.map, key, op);
      }
    }
    // 제거 — props.map의 wms-* layer 중 selected에 없는 것
    if (props.map.getStyle && props.map.getStyle()) {
      const style = props.map.getStyle();
      const layers = style.layers || [];
      for (const layer of layers) {
        if (typeof layer.id === "string" && layer.id.startsWith("wms-")) {
          const key = layer.id.slice(4);
          if (!props.selectedWmsKeys.has(key)) removeWmsLayer(props.map, key);
        }
      }
    }
    // opacity 동기화
    for (const [key, op] of Object.entries(props.wmsOpacity)) {
      if (props.selectedWmsKeys.has(key) && hasWmsLayer(props.map, key)) {
        applyWmsOpacity(props.map, key, op);
      }
    }
  }, [props.map, props.selectedWmsKeys, props.wmsOpacity, wmsLayerInfo]);

  function toggleWmsSelect(key: string) {
    const next = new Set(props.selectedWmsKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    props.setSelectedWmsKeys(next);
  }

  function bulkSetWmsSelected(keys: string[], select: boolean) {
    const next = new Set(props.selectedWmsKeys);
    if (select) {
      for (const k of keys) next.add(k);
    } else {
      for (const k of keys) next.delete(k);
    }
    props.setSelectedWmsKeys(next);
  }

  function setOneWmsOpacity(key: string, op: number) {
    props.setWmsOpacity({ ...props.wmsOpacity, [key]: op });
  }

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

  function handleOpacity(layerId: string, opacity: number) {
    props.setLayerOpacity({ ...props.layerOpacity, [layerId]: opacity });
    if (props.map) applyLayerOpacity(props.map, layerId, opacity);
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
                          {hasFillLayer(props.map, h.layerId!) ? (
                            <div className="tree-item-slider">
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={Math.round((props.layerOpacity[h.layerId!] ?? 0.25) * 100)}
                                onChange={(e) => handleOpacity(h.layerId!, Number(e.target.value) / 100)}
                                title="투명도"
                              />
                              <span>{Math.round((props.layerOpacity[h.layerId!] ?? 0.25) * 100)}%</span>
                            </div>
                          ) : null}
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

        {/* WMS Overlay (P13) */}
        <div className="layer-section">
          <div className="layer-section-title">
            🔌 WMS Overlay
            <button
              className="tree-reload-btn"
              onClick={props.onReloadWmsTree}
              title="WMS 트리 다시 불러오기"
              style={{ marginLeft: 6 }}
            >
              ↻
            </button>
          </div>
          {props.wmsTreeLoading && (
            <div className="layer-section-placeholder">WMS 트리 로딩 중…</div>
          )}
          {props.wmsTreeError && (
            <div className="layer-section-error">
              {props.wmsTreeError}
              <button
                onClick={props.onReloadWmsTree}
                className="tree-reload-btn"
                style={{ marginLeft: 8 }}
              >
                재시도
              </button>
            </div>
          )}
          {!props.wmsTreeLoading && !props.wmsTreeError && props.wmsTree.length === 0 && (
            <div className="layer-section-placeholder">WMS layer 없음</div>
          )}
          {!props.wmsTreeLoading && !props.wmsTreeError && props.wmsTree.length > 0 && (
            <ul className="tree-children">
              {props.wmsTree.map((root) => (
                <WmsTreeNodeView
                  key={root.id}
                  node={root}
                  selectedKeys={props.selectedWmsKeys}
                  toggleSelect={(key) => toggleWmsSelect(key)}
                  bulkSetSelected={bulkSetWmsSelected}
                  opacity={props.wmsOpacity}
                  setOpacity={setOneWmsOpacity}
                />
              ))}
            </ul>
          )}
        </div>

        {/* 사용자 그리기 (P13) */}
        <div className="layer-section">
          <div className="layer-section-title">
            ✏️ 사용자 그리기
            <label className="draw-toggle-label" style={{ marginLeft: 8 }}>
              <input
                type="checkbox"
                checked={props.drawEnabled}
                onChange={(e) => props.setDrawEnabled(e.target.checked)}
              />
              <span style={{ fontSize: 11 }}>활성</span>
            </label>
          </div>
          <DrawnFeatures
            drawnFeatures={props.drawnFeatures}
            toggleVisible={props.toggleDrawnFeatureVisible}
            remove={props.removeDrawnFeature}
          />
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
