import { useEffect, useState } from "react";

interface SettingsTabProps {
  model: string;
  setModel: (m: string) => void;
  systemPrompt: string;
  setSystemPrompt: (s: string) => void;
  disableThinking: boolean;
  setDisableThinking: (v: boolean) => void;
}

export default function SettingsTab(props: SettingsTabProps) {
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    void loadModels();
  }, []);

  async function loadModels() {
    setLoadingModels(true);
    try {
      const r = await fetch("/api/v1/models");
      const j = await r.json();
      const models = (j.data ?? []).map((e: any) => e.id);
      setAvailableModels(models);
      if (models[0] && !models.includes(props.model)) props.setModel(models[0]);
    } catch {
      // silent
    } finally {
      setLoadingModels(false);
    }
  }

  return (
    <div className="settings-tab">
      <div className="field">
        <label>모델</label>
        <div className="row">
          <select value={props.model} onChange={(e) => props.setModel(e.target.value)}>
            {availableModels.length === 0 ? (
              <option value={props.model}>{props.model}</option>
            ) : (
              availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))
            )}
          </select>
          <button className="secondary-button" onClick={() => void loadModels()} disabled={loadingModels}>
            {loadingModels ? "..." : "새로고침"}
          </button>
        </div>
      </div>

      <div className="field">
        <label>System prompt (사용자 추가)</label>
        <textarea
          value={props.systemPrompt}
          onChange={(e) => props.setSystemPrompt(e.target.value)}
          rows={3}
          placeholder="브릿지 system prompt와 합쳐짐"
        />
      </div>

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={props.disableThinking}
          onChange={(e) => props.setDisableThinking(e.target.checked)}
        />
        <span>thinking 끄기 (빠른 응답)</span>
      </label>

      <p style={{ fontSize: 11, color: "var(--fg-muted)", margin: 0 }}>
        배경지도·3D·도구 layer 컨트롤은 좌상단 🗂️ 레이어 패널로 이전됨.
      </p>
    </div>
  );
}
