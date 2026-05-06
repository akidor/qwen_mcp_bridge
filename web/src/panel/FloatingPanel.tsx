import { useState } from "react";
import ChatTab from "./ChatTab";
import SettingsTab from "./SettingsTab";
import DebugTab from "./DebugTab";
import { BasemapKind } from "../map/basemaps";
import { applyToolResult, fitToBbox } from "../map/auto_layer";

type TabName = "chat" | "settings" | "debug";

interface FloatingPanelProps {
  map: any;
  basemap: BasemapKind;
  setBasemap: (b: BasemapKind) => void;
}

const DEFAULT_MODEL = "Qwen/Qwen3.6-35B-A3B";
const DEFAULT_SYSTEM_PROMPT = "한국어로 짧고 명확하게 답해.";

export default function FloatingPanel({ map, basemap, setBasemap }: FloatingPanelProps) {
  const [activeTab, setActiveTab] = useState<TabName>("chat");
  const [collapsed, setCollapsed] = useState(false);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [disableThinking, setDisableThinking] = useState(true);
  const [lastChunk, setLastChunk] = useState<unknown>(null);
  const [toolHistory, setToolHistory] = useState<{
    name: string;
    ts: number;
    layerId: string | null;
    message: string;
    bbox?: [number, number, number, number];
  }[]>([]);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [terrainEnabled, setTerrainEnabled] = useState(false);
  const [buildingsEnabled, setBuildingsEnabled] = useState(false);

  function handleToolResult(toolName: string, resultText: string) {
    const ts = Date.now();
    if (!map) {
      setToolHistory((cur) => [...cur, { name: toolName, ts, layerId: null, message: "map 미준비" }]);
      return;
    }
    const r = applyToolResult(map, toolName, resultText);
    setToolHistory((cur) => [...cur, { name: toolName, ts, layerId: r.layerId, message: r.message, bbox: r.bbox }]);
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

      {/* 모든 탭을 항상 마운트하고 visibility만 토글 — ChatTab의 messages/input local state가
          탭 전환 시 초기화되지 않게 함. 비활성 탭은 display:none. */}
      <div className="panel-body">
        <div className={`tab-pane ${activeTab === "chat" ? "" : "hidden"}`}>
          <ChatTab
            model={model}
            systemPrompt={systemPrompt}
            disableThinking={disableThinking}
            onLastChunk={setLastChunk}
            onToolResult={handleToolResult}
          />
        </div>
        <div className={`tab-pane ${activeTab === "settings" ? "" : "hidden"}`}>
          <SettingsTab
            map={map}
            model={model}
            setModel={setModel}
            systemPrompt={systemPrompt}
            setSystemPrompt={setSystemPrompt}
            disableThinking={disableThinking}
            setDisableThinking={setDisableThinking}
            basemap={basemap}
            setBasemap={setBasemap}
            terrainEnabled={terrainEnabled}
            setTerrainEnabled={setTerrainEnabled}
            buildingsEnabled={buildingsEnabled}
            setBuildingsEnabled={setBuildingsEnabled}
          />
        </div>
        <div className={`tab-pane ${activeTab === "debug" ? "" : "hidden"}`}>
          <DebugTab
            map={map}
            lastChunk={lastChunk}
            toolHistory={toolHistory}
            layerVisibility={layerVisibility}
            setLayerVisibility={setLayerVisibility}
          />
        </div>
      </div>
    </div>
  );
}
