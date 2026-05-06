import { useEffect, useState } from "react";
import {
  BasemapKind,
  BASEMAP_ORDER,
  setTerrainEnabled as applyTerrain,
  setBuildingsEnabled as applyBuildings,
} from "../map/basemaps";

interface SettingsTabProps {
  map: any;
  model: string;
  setModel: (m: string) => void;
  systemPrompt: string;
  setSystemPrompt: (s: string) => void;
  disableThinking: boolean;
  setDisableThinking: (v: boolean) => void;
  basemap: BasemapKind;
  setBasemap: (b: BasemapKind) => void;
  terrainEnabled: boolean;
  setTerrainEnabled: (v: boolean) => void;
  buildingsEnabled: boolean;
  setBuildingsEnabled: (v: boolean) => void;
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

      <div className="field">
        <label>Basemap</label>
        <div className="basemap-row">
          {BASEMAP_ORDER.map((k) => (
            <button
              key={k}
              className={`basemap-pill ${props.basemap === k ? "active" : ""}`}
              onClick={() => props.setBasemap(k)}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>3D</label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={props.terrainEnabled}
            onChange={handleTerrainToggle}
          />
          <span>3D 지형 (terrain + hillshade)</span>
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={props.buildingsEnabled}
            onChange={handleBuildingsToggle}
          />
          <span>3D 건물 (fill-extrusion)</span>
        </label>
      </div>
    </div>
  );
}
