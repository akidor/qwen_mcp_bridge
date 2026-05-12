import { useState } from "react";
import ChatTab from "./ChatTab";
import SettingsTab from "./SettingsTab";
import DebugTab from "./DebugTab";
import { BasemapKind } from "../map/basemaps";
import { applyToolResult, fitToBbox } from "../map/auto_layer";
import { getCurrentIntent, shouldRenderToolResult } from "../intent/intentStore";

type TabName = "chat" | "settings" | "debug";

interface ToolHistoryEntry {
  name: string;
  ts: number;
  layerId: string | null;
  message: string;
  bbox?: [number, number, number, number];
  resultText?: string;
}

interface FloatingPanelProps {
  map: any;
  basemap: BasemapKind;
  setBasemap: (b: BasemapKind) => void;
  terrainEnabled: boolean;
  setTerrainEnabled: (v: boolean) => void;
  buildingsEnabled: boolean;
  setBuildingsEnabled: (v: boolean) => void;
  toolHistory: ToolHistoryEntry[];
  setToolHistory: React.Dispatch<React.SetStateAction<ToolHistoryEntry[]>>;
  layerVisibility: Record<string, boolean>;
  setLayerVisibility: (next: Record<string, boolean>) => void;
  drawnFeatures: { id: string; geometry: GeoJSON.Geometry; label: string; ts?: number }[];
  onUiAction?: (action: string, params: any) => void;
  wmsLeafLabels?: string[];
  onParcelFocus?: (card: any) => void;
}

export const DEFAULT_MODEL = "Qwen/Qwen3.6-35B-A3B";
export const DEFAULT_SYSTEM_PROMPT = "한국어로 짧고 명확하게 답해.";

export default function FloatingPanel({
  map, basemap, setBasemap,
  terrainEnabled, setTerrainEnabled,
  buildingsEnabled, setBuildingsEnabled,
  toolHistory, setToolHistory,
  layerVisibility, setLayerVisibility,
  drawnFeatures,
  onUiAction,
  wmsLeafLabels = [],
  onParcelFocus,
}: FloatingPanelProps) {
  const [activeTab, setActiveTab] = useState<TabName>("chat");
  const [collapsed, setCollapsed] = useState(false);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [disableThinking, setDisableThinking] = useState(true);
  const [lastChunk, setLastChunk] = useState<unknown>(null);

  function handleToolResult(toolName: string, resultText: string) {
    const ts = Date.now();
    if (!map) {
      setToolHistory((cur) => [...cur, { name: toolName, ts, layerId: null, message: "map 미준비", resultText }]);
      return;
    }
    // intent에 따라 일부 중간 결과는 지도에 깔지 않음 (existing_buildings의 find_parcels 등).
    if (!shouldRenderToolResult(toolName, getCurrentIntent())) {
      setToolHistory((cur) => [...cur, { name: toolName, ts, layerId: null, message: "intent-skip(중간 결과 시각화 억제)", resultText }]);
      return;
    }
    const r = applyToolResult(map, toolName, resultText);
    setToolHistory((cur) => [...cur, { name: toolName, ts, layerId: r.layerId, message: r.message, bbox: r.bbox, resultText }]);
    if (r.bbox) fitToBbox(map, r.bbox);
  }

  if (collapsed) {
    return (
      <div className="floating-panel collapsed">
        <button className="panel-toggle" onClick={() => setCollapsed(false)} aria-label="패널 열기">
          ›
        </button>
      </div>
    );
  }

  return (
    <div className="floating-panel">
      <div className="panel-tabs">
        <button
          className={`panel-tab ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          대화
        </button>
        <button
          className={`panel-tab ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          설정
        </button>
        <button
          className={`panel-tab ${activeTab === "debug" ? "active" : ""}`}
          onClick={() => setActiveTab("debug")}
        >
          디버그
        </button>
        <button className="panel-toggle" onClick={() => setCollapsed(true)} aria-label="패널 접기">
          ‹
        </button>
      </div>

      <div className="panel-body">
        <div className={`tab-pane ${activeTab === "chat" ? "" : "hidden"}`}>
          <ChatTab
            model={model}
            systemPrompt={systemPrompt}
            disableThinking={disableThinking}
            onLastChunk={setLastChunk}
            onToolResult={handleToolResult}
            drawnFeatures={drawnFeatures}
            onUiAction={onUiAction}
            wmsLeafLabels={wmsLeafLabels}
            onParcelFocus={onParcelFocus}
          />
        </div>
        <div className={`tab-pane ${activeTab === "settings" ? "" : "hidden"}`}>
          <SettingsTab
            model={model}
            setModel={setModel}
            systemPrompt={systemPrompt}
            setSystemPrompt={setSystemPrompt}
            disableThinking={disableThinking}
            setDisableThinking={setDisableThinking}
          />
        </div>
        <div className={`tab-pane ${activeTab === "debug" ? "" : "hidden"}`}>
          <DebugTab lastChunk={lastChunk} />
        </div>
      </div>
    </div>
  );
}
