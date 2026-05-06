import { useState } from "react";
import MapView from "./map/MapView";
import { BasemapKind } from "./map/basemaps";
import FloatingPanel from "./panel/FloatingPanel";
import LayerPanel from "./panel/LayerPanel";

interface ToolHistoryEntry {
  name: string;
  ts: number;
  layerId: string | null;
  message: string;
  bbox?: [number, number, number, number];
  resultText?: string;
}

export default function App() {
  const [basemap, setBasemap] = useState<BasemapKind>("white");
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [terrainEnabled, setTerrainEnabled] = useState(false);
  const [buildingsEnabled, setBuildingsEnabled] = useState(false);
  const [toolHistory, setToolHistory] = useState<ToolHistoryEntry[]>([]);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [layerOpacity, setLayerOpacity] = useState<Record<string, number>>({});

  return (
    <>
      <MapView
        basemap={basemap}
        onReady={(map) => setMapInstance(map)}
      />
      <FloatingPanel
        map={mapInstance}
        basemap={basemap}
        setBasemap={setBasemap}
        terrainEnabled={terrainEnabled}
        setTerrainEnabled={setTerrainEnabled}
        buildingsEnabled={buildingsEnabled}
        setBuildingsEnabled={setBuildingsEnabled}
        toolHistory={toolHistory}
        setToolHistory={setToolHistory}
        layerVisibility={layerVisibility}
        setLayerVisibility={setLayerVisibility}
      />
      <LayerPanel
        map={mapInstance}
        basemap={basemap}
        setBasemap={setBasemap}
        terrainEnabled={terrainEnabled}
        setTerrainEnabled={setTerrainEnabled}
        buildingsEnabled={buildingsEnabled}
        setBuildingsEnabled={setBuildingsEnabled}
        toolHistory={toolHistory}
        layerVisibility={layerVisibility}
        setLayerVisibility={setLayerVisibility}
        layerOpacity={layerOpacity}
        setLayerOpacity={setLayerOpacity}
      />
    </>
  );
}
