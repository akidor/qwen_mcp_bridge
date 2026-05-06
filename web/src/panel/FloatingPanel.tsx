import { useState } from "react";
import ChatTab from "./ChatTab";
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

      <div className="panel-body">
        {activeTab === "chat" && (
          <ChatTab
            model={model}
            systemPrompt={systemPrompt}
            disableThinking={disableThinking}
            onLastChunk={setLastChunk}
            onToolResult={handleToolResult}
          />
        )}
        {activeTab === "settings" && (
          <div className="settings-tab">
            <p style={{ color: "#7c3aed", fontSize: 11, letterSpacing: "0.06em", margin: 0 }}>
              SETTINGS — T6에서 본 구현
            </p>
            <p style={{ fontSize: 12, color: "#52525b", marginTop: 4 }}>
              현재: model={model}, basemap={basemap}, thinking={disableThinking ? "off" : "on"}
            </p>
          </div>
        )}
        {activeTab === "debug" && (
          <div className="debug-tab">
            <p style={{ color: "#7c3aed", fontSize: 11, letterSpacing: "0.06em", margin: 0 }}>
              DEBUG — T6에서 본 구현
            </p>
            <p style={{ fontSize: 12, color: "#52525b", marginTop: 4 }}>
              tool calls: {toolHistory.length} · last chunk: {lastChunk ? "있음" : "없음"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
