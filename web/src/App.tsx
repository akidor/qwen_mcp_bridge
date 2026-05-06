import { useEffect, useState } from "react";
import MapView from "./map/MapView";
import { BasemapKind } from "./map/basemaps";
import FloatingPanel from "./panel/FloatingPanel";
import LayerPanel from "./panel/LayerPanel";
import { fetchWmsTree } from "./wms/tree";
import type { WmsTreeNode } from "./wms/types";

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

  const [wmsTree, setWmsTree] = useState<WmsTreeNode[]>([]);
  const [wmsTreeError, setWmsTreeError] = useState<string | null>(null);
  const [wmsTreeLoading, setWmsTreeLoading] = useState(false);
  const [selectedWmsKeys, setSelectedWmsKeys] = useState<Set<string>>(new Set());
  const [wmsOpacity, setWmsOpacity] = useState<Record<string, number>>({});
  const [wmsReloadToken, setWmsReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setWmsTreeLoading(true);
    setWmsTreeError(null);
    fetchWmsTree()
      .then((tree) => {
        if (!cancelled) setWmsTree(tree);
      })
      .catch((e: unknown) => {
        if (!cancelled) setWmsTreeError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setWmsTreeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wmsReloadToken]);

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
        wmsTree={wmsTree}
        wmsTreeError={wmsTreeError}
        wmsTreeLoading={wmsTreeLoading}
        selectedWmsKeys={selectedWmsKeys}
        setSelectedWmsKeys={setSelectedWmsKeys}
        wmsOpacity={wmsOpacity}
        setWmsOpacity={setWmsOpacity}
        onReloadWmsTree={() => setWmsReloadToken((t) => t + 1)}
      />
    </>
  );
}
