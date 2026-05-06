/** VWorld WMTS basemap 5종 + DEM. 폴리곤 제너레이터 frontend와 동일 패턴. */

export const VWORLD_API_KEY: string = import.meta.env.VITE_VWORLD_API_KEY ?? "";

export type BasemapKind = "white" | "base" | "satellite" | "midnight" | "hybrid";

export const BASE_TILES: Record<BasemapKind, string> = {
  satellite: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Satellite/{z}/{y}/{x}.jpeg`,
  base: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Base/{z}/{y}/{x}.png`,
  white: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/white/{z}/{y}/{x}.png`,
  midnight: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/midnight/{z}/{y}/{x}.png`,
  hybrid: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Hybrid/{z}/{y}/{x}.png`,
};

export const BASEMAP_ORDER: BasemapKind[] = ["white", "base", "satellite", "midnight", "hybrid"];

/** MapLibre StyleSpecification — 모든 basemap을 source로 등록, default visible은 white만. */
export function makeStyle(initialBasemap: BasemapKind = "white"): any {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: Object.fromEntries(
      BASEMAP_ORDER.map((k) => [
        `basemap-${k}`,
        { type: "raster", tiles: [BASE_TILES[k]], tileSize: 256, maxzoom: 19 } as const,
      ])
    ),
    layers: BASEMAP_ORDER.map((k) => ({
      id: `basemap-${k}`,
      type: "raster",
      source: `basemap-${k}`,
      layout: { visibility: k === initialBasemap ? "visible" : "none" },
    })),
  };
}

/** 현재 활성 basemap을 visibility로 토글. */
export function setActiveBasemap(map: any, kind: BasemapKind): void {
  for (const k of BASEMAP_ORDER) {
    map.setLayoutProperty(`basemap-${k}`, "visibility", k === kind ? "visible" : "none");
  }
}
