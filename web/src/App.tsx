import { useEffect, useRef, useState } from "react";
import MapView from "./map/MapView";
import { BasemapKind } from "./map/basemaps";
import FloatingPanel from "./panel/FloatingPanel";
import LayerPanel from "./panel/LayerPanel";
import { fetchWmsTree } from "./wms/tree";
import type { WmsTreeNode } from "./wms/types";
import { createDraw, geomToLabel } from "./map/draw";
import type { DrawnFeature } from "./panel/DrawnFeatures";
import { useIsMobile } from "./hooks/useIsMobile";
import { useVisualViewportHeight } from "./hooks/useVisualViewportHeight";
import MobileLayout from "./mobile/MobileLayout";
import MobileMapBar from "./mobile/MobileMapBar";
import BottomSheet from "./mobile/BottomSheet";
import BottomSheetContent from "./mobile/BottomSheetContent";
import LayerPanelBody from "./panel/LayerPanelBody";
import SettingsTab from "./panel/SettingsTab";
import DebugTab from "./panel/DebugTab";
import ChatTab from "./panel/ChatTab";
import { DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from "./panel/FloatingPanel";

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

  const [drawEnabled, setDrawEnabled] = useState(false);
  const [drawnFeatures, setDrawnFeatures] = useState<DrawnFeature[]>([]);
  const [drawInstance, setDrawInstance] = useState<any>(null);

  const isMobile = useIsMobile();
  const vv = useVisualViewportHeight();
  const [bottomSheetMode, setBottomSheetMode] = useState<"layer" | "settings" | "debug" | null>(null);
  const [mobileModel, setMobileModel] = useState(DEFAULT_MODEL);
  const [mobileSystemPrompt, setMobileSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [mobileDisableThinking, setMobileDisableThinking] = useState(true);
  const [mobileLastChunk, setMobileLastChunk] = useState<unknown>(null);

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

  const onDrawCreateRef = useRef<(e: any) => void>(() => {});
  const onDrawDeleteRef = useRef<(e: any) => void>(() => {});

  useEffect(() => {
    onDrawCreateRef.current = (e: any) => {
      const features: any[] = e?.features ?? [];
      setDrawnFeatures((cur) => {
        const byId = new Map(cur.map((f) => [f.id, f]));
        for (const f of features) {
          const id = String(f.id);
          const geom = f.geometry as GeoJSON.Geometry;
          const type = geom.type;
          if (type !== "Polygon" && type !== "LineString" && type !== "Point") continue;
          byId.set(id, {
            id,
            geometry: geom,
            geometryType: type,
            label: geomToLabel(geom),
            visible: true,
            ts: Date.now(),
          });
        }
        return Array.from(byId.values());
      });
    };
    onDrawDeleteRef.current = (e: any) => {
      const ids = new Set<string>((e?.features ?? []).map((f: any) => String(f.id)));
      setDrawnFeatures((cur) => cur.filter((f) => !ids.has(f.id)));
    };
  });

  useEffect(() => {
    if (!mapInstance || !drawEnabled) return;
    const draw = createDraw();
    const onCreate = (e: any) => onDrawCreateRef.current(e);
    const onDelete = (e: any) => onDrawDeleteRef.current(e);
    mapInstance.addControl(draw as any, "top-left");
    mapInstance.on("draw.create", onCreate);
    mapInstance.on("draw.update", onCreate);
    mapInstance.on("draw.delete", onDelete);
    setDrawInstance(draw);
    return () => {
      mapInstance.off("draw.create", onCreate);
      mapInstance.off("draw.update", onCreate);
      mapInstance.off("draw.delete", onDelete);
      try {
        mapInstance.removeControl(draw);
      } catch {
        // ignore
      }
      setDrawInstance(null);
      setDrawnFeatures([]);
    };
  }, [mapInstance, drawEnabled]);

  function toggleDrawnFeatureVisible(id: string) {
    setDrawnFeatures((cur) =>
      cur.map((f) => {
        if (f.id !== id) return f;
        const nextVisible = !f.visible;
        if (drawInstance && typeof drawInstance.setFeatureProperty === "function") {
          drawInstance.setFeatureProperty(id, "visible", nextVisible);
        }
        return { ...f, visible: nextVisible };
      })
    );
  }

  function removeDrawnFeature(id: string) {
    if (drawInstance && typeof drawInstance.delete === "function") {
      drawInstance.delete(id);
    }
    setDrawnFeatures((cur) => cur.filter((f) => f.id !== id));
  }

  if (isMobile) {
    const layerSlot = (
      <LayerPanelBody
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
        drawEnabled={drawEnabled}
        setDrawEnabled={setDrawEnabled}
        drawnFeatures={drawnFeatures}
        toggleDrawnFeatureVisible={toggleDrawnFeatureVisible}
        removeDrawnFeature={removeDrawnFeature}
        onChartClick={() => { /* mobile에선 차트 모달 14차 외 yagni */ }}
      />
    );
    const settingsSlot = (
      <SettingsTab
        model={mobileModel}
        setModel={setMobileModel}
        systemPrompt={mobileSystemPrompt}
        setSystemPrompt={setMobileSystemPrompt}
        disableThinking={mobileDisableThinking}
        setDisableThinking={setMobileDisableThinking}
      />
    );
    const debugSlot = <DebugTab lastChunk={mobileLastChunk} />;

    return (
      <>
        <MobileLayout
          isKeyboardOpen={vv.isKeyboardOpen}
          visualViewportHeightPx={vv.height}
          mapSlot={
            <MapView basemap={basemap} onReady={(map) => setMapInstance(map)} />
          }
          mapBarSlot={
            <MobileMapBar
              onLayerClick={() => setBottomSheetMode("layer")}
              onSettingsClick={() => setBottomSheetMode("settings")}
            />
          }
          chatSlot={
            <ChatTab
              mode="mobile"
              model={mobileModel}
              systemPrompt={mobileSystemPrompt}
              disableThinking={mobileDisableThinking}
              onLastChunk={setMobileLastChunk}
              onToolResult={(toolName, resultText) => {
                if (!mapInstance) {
                  setToolHistory((cur) => [
                    ...cur,
                    { name: toolName, ts: Date.now(), layerId: null, message: "map 미준비", resultText },
                  ]);
                  return;
                }
                import("./map/auto_layer").then(({ applyToolResult, fitToBbox }) => {
                  const r = applyToolResult(mapInstance, toolName, resultText);
                  setToolHistory((cur) => [
                    ...cur,
                    { name: toolName, ts: Date.now(), layerId: r.layerId, message: r.message, bbox: r.bbox, resultText },
                  ]);
                  if (r.bbox) fitToBbox(mapInstance, r.bbox);
                });
              }}
              drawnFeatures={drawnFeatures}
            />
          }
        />
        <BottomSheet open={bottomSheetMode !== null} onClose={() => setBottomSheetMode(null)}>
          <BottomSheetContent
            mode={bottomSheetMode}
            layerSlot={layerSlot}
            settingsSlot={settingsSlot}
            debugSlot={debugSlot}
          />
        </BottomSheet>
      </>
    );
  }

  // 데스크톱 (기존)
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
        drawnFeatures={drawnFeatures}
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
        drawEnabled={drawEnabled}
        setDrawEnabled={setDrawEnabled}
        drawnFeatures={drawnFeatures}
        toggleDrawnFeatureVisible={toggleDrawnFeatureVisible}
        removeDrawnFeature={removeDrawnFeature}
      />
    </>
  );
}
