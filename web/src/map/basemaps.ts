/** VWorld WMTS basemap 5종 + MARTIN DEM/3D buildings. 폴리곤 제너레이터 frontend와 동일 패턴. */

export const VWORLD_API_KEY: string = import.meta.env.VITE_VWORLD_API_KEY ?? "";
export const MARTIN_BASE: string =
  import.meta.env.VITE_MARTIN_URL ?? "http://175.208.134.144:9517";

export type BasemapKind = "white" | "base" | "gray" | "satellite" | "midnight" | "hybrid";

export const BASE_TILES: Record<BasemapKind, string> = {
  satellite: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Satellite/{z}/{y}/{x}.jpeg`,
  base: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Base/{z}/{y}/{x}.png`,
  // gray = base와 동일 tile, raster-saturation -1로 회색조 (dlof_landing의 group3 동일).
  gray: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Base/{z}/{y}/{x}.png`,
  white: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/white/{z}/{y}/{x}.png`,
  midnight: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/midnight/{z}/{y}/{x}.png`,
  hybrid: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Hybrid/{z}/{y}/{x}.png`,
};

export const BASEMAP_ORDER: BasemapKind[] = ["base", "gray", "white", "satellite", "midnight", "hybrid"];

/** MapLibre StyleSpecification — basemap 6종 + raster-dem(terrain). */
export function makeStyle(initialBasemap: BasemapKind = "base"): any {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      ...Object.fromEntries(
        BASEMAP_ORDER.map((k) => [
          `basemap-${k}`,
          { type: "raster", tiles: [BASE_TILES[k]], tileSize: 256, maxzoom: 19 } as const,
        ])
      ),
      "terrain-dem": {
        type: "raster-dem",
        tiles: [`${MARTIN_BASE}/terrain-rgb/{z}/{x}/{y}`],
        tileSize: 256,
        maxzoom: 12,
        encoding: "mapbox",
      },
    },
    layers: BASEMAP_ORDER.map((k) => ({
      id: `basemap-${k}`,
      type: "raster",
      source: `basemap-${k}`,
      layout: { visibility: k === initialBasemap ? "visible" : "none" },
      // gray: saturation -1 + brightness slight bump (dlof_landing의 grayscale 100% 효과).
      paint: k === "gray" ? { "raster-saturation": -1, "raster-brightness-min": 0.05 } : {},
    })),
  };
}

/** 현재 활성 basemap을 visibility로 토글. */
export function setActiveBasemap(map: any, kind: BasemapKind): void {
  for (const k of BASEMAP_ORDER) {
    map.setLayoutProperty(`basemap-${k}`, "visibility", k === kind ? "visible" : "none");
  }
}

/** Sky — 폴리곤 제너레이터와 동일 (sky-color + horizon blend). */
export function setupSky(map: any): void {
  try {
    map.setSky({
      "sky-color": "#89CFF0",
      "sky-horizon-blend": 0.5,
    });
  } catch (e) {
    console.warn("[setupSky] failed:", e);
  }
}

/** Hillshade (음영기복). 기본 비활성. terrain-dem source를 공유. */
export function setupHillshade(map: any): void {
  try {
    map.addLayer(
      {
        id: "hillshade",
        type: "hillshade",
        source: "terrain-dem",
        paint: {
          "hillshade-exaggeration": 0.5,
          "hillshade-shadow-color": "#000000",
          "hillshade-highlight-color": "#ffffff",
          "hillshade-accent-color": "#000000",
          "hillshade-illumination-direction": 315,
          "hillshade-illumination-anchor": "viewport",
        },
        layout: { visibility: "none" },
      },
      "basemap-base"
    );
  } catch (e) {
    console.warn("[setupHillshade] failed:", e);
  }
}

/** 3D 건물 — MARTIN의 buld_3d vector tile, fill-extrusion. 기본 비활성. */
export function setupBuildings(map: any): void {
  try {
    map.addSource("buld-3d", {
      type: "vector",
      tiles: [`${MARTIN_BASE}/buld_3d/{z}/{x}/{y}`],
      minzoom: 10,
      maxzoom: 15,
    });
    map.addLayer({
      id: "buld-3d-extrusion",
      type: "fill-extrusion",
      source: "buld-3d",
      "source-layer": "buld_3d",
      minzoom: 11,
      paint: {
        "fill-extrusion-color": "#ffffff",
        "fill-extrusion-height": ["to-number", ["coalesce", ["get", "height"], "9"]],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.9,
        "fill-extrusion-vertical-gradient": false,
      },
      layout: { visibility: "none" },
    });
  } catch (e) {
    console.warn("[setupBuildings] failed:", e);
  }
}

/** 3D 지형 토글 (setTerrain + hillshade visibility 동시). */
export function setTerrainEnabled(map: any, enabled: boolean): void {
  try {
    if (enabled) {
      map.setTerrain({ source: "terrain-dem", exaggeration: 1.5 });
      if (map.getLayer("hillshade")) {
        map.setLayoutProperty("hillshade", "visibility", "visible");
      }
    } else {
      map.setTerrain(null);
      if (map.getLayer("hillshade")) {
        map.setLayoutProperty("hillshade", "visibility", "none");
      }
    }
  } catch (e) {
    console.warn("[setTerrainEnabled] failed:", e);
  }
}

/** 3D 건물 토글 (visibility만). */
export function setBuildingsEnabled(map: any, enabled: boolean): void {
  try {
    if (map.getLayer("buld-3d-extrusion")) {
      map.setLayoutProperty("buld-3d-extrusion", "visibility", enabled ? "visible" : "none");
    }
  } catch (e) {
    console.warn("[setBuildingsEnabled] failed:", e);
  }
}
