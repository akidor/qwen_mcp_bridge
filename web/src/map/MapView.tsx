import { useEffect, useRef } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { makeStyle, setActiveBasemap, BasemapKind } from "./basemaps";

interface MapViewProps {
  initialCenter?: [number, number];   // [lng, lat]; default 강남역
  initialZoom?: number;
  basemap?: BasemapKind;              // 현재 basemap
  onReady?: (map: MapLibreMap) => void;
}

export default function MapView({
  initialCenter = [127.027619, 37.497952],   // 강남역
  initialZoom = 13,
  basemap = "white",
  onReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  // 최초 init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: makeStyle(basemap),
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
    });
    mapRef.current = map;
    map.on("load", () => onReady?.(map));
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // basemap 변경 시 visibility 토글
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      setActiveBasemap(map, basemap);
    } else {
      map.once("load", () => setActiveBasemap(map, basemap));
    }
  }, [basemap]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
      }}
    />
  );
}
