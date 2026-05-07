/** Tool 결과 텍스트(JSON)를 파싱해 MapLibre source/layer로 자동 추가. */

const COLOR_PARCEL_FILL = "#7c3aed";
const COLOR_PARCEL_OUTLINE = "#5b21b6";
const COLOR_PARCEL_LABEL = "#5b21b6";
const COLOR_ISOCHRONE = "#22c55e";
const COLOR_ISOCHRONE_LABEL = "#15803d";
const COLOR_POI = "#0ea5e9";
const COLOR_POI_LABEL = "#0c4a6e";
const COLOR_ROUTE = "#f59e0b";
const COLOR_BUFFER = "#a8a29e";
const COLOR_AGGREGATION = "#737373";

// POI 좌표 jitter — 동일 좌표 점들이 겹치지 않게 미세 흐트림 (~0.0001° ≈ 11m).
const POI_JITTER_DEG = 0.0001;

type Geom = { type: string; coordinates: any };

interface ApplyResult {
  layerId: string | null;
  message: string;
  bbox?: [number, number, number, number];
}

let _seq = 0;
function uniqueId(prefix: string): string {
  _seq += 1;
  return `${prefix}-${_seq}`;
}

function isGeometry(g: any): g is Geom {
  return g && typeof g === "object" && typeof g.type === "string" && "coordinates" in g;
}

function bboxOfPolygon(coords: any): [number, number, number, number] | undefined {
  try {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const ring = coords[0]; // outer ring of Polygon
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return [minX, minY, maxX, maxY];
  } catch {
    return undefined;
  }
}

/** Point coordinates 미세 jitter — 같은 좌표 POI들이 한 점에 겹치는 걸 흐트림. */
function jitterPointFc(fc: any): any {
  if (fc?.type !== "FeatureCollection" || !Array.isArray(fc.features)) return fc;
  const features = fc.features.map((f: any) => {
    if (f?.geometry?.type !== "Point") return f;
    const c = f.geometry.coordinates;
    if (!Array.isArray(c) || c.length < 2) return f;
    const dx = (Math.random() - 0.5) * 2 * POI_JITTER_DEG;
    const dy = (Math.random() - 0.5) * 2 * POI_JITTER_DEG;
    return {
      ...f,
      geometry: { ...f.geometry, coordinates: [c[0] + dx, c[1] + dy, ...c.slice(2)] },
    };
  });
  return { ...fc, features };
}

/** 라벨 layer 추가 (overlap 허용 — 모든 POI 항상 보이게). */
function addLabelLayer(
  map: any,
  layerId: string,
  sourceId: string,
  textField: any,
  color: string,
  options: { offset?: [number, number]; size?: number } = {},
): void {
  map.addLayer({
    id: `${layerId}-label`,
    type: "symbol",
    source: sourceId,
    layout: {
      "text-field": textField,
      "text-size": options.size ?? 11,
      "text-anchor": "top",
      "text-offset": options.offset ?? [0, 0.6],
      "text-allow-overlap": true,        // 겹쳐도 표시
      "text-ignore-placement": true,     // 다른 라벨 placement 영향 X
      "text-padding": 0,
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
    },
    paint: {
      "text-color": color,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
      "text-halo-blur": 0.5,
    },
  });
}

function addPolygonLayer(
  map: any,
  geom: Geom,
  layerId: string,
  fillColor: string,
  outlineColor: string,
  options: { outlineDash?: number[]; labelText?: string } = {},
): ApplyResult {
  const sourceId = `${layerId}-src`;
  if (map.getSource(sourceId)) return { layerId, message: "이미 존재" };
  const properties: Record<string, any> = {};
  if (options.labelText) properties.label = options.labelText;
  map.addSource(sourceId, {
    type: "geojson",
    data: { type: "Feature", properties, geometry: geom },
  });
  map.addLayer({
    id: `${layerId}-fill`,
    type: "fill",
    source: sourceId,
    paint: { "fill-color": fillColor, "fill-opacity": 0.25 },
  });
  map.addLayer({
    id: `${layerId}-line`,
    type: "line",
    source: sourceId,
    paint: {
      "line-color": outlineColor,
      "line-width": 1.5,
      ...(options.outlineDash ? { "line-dasharray": options.outlineDash } : {}),
    },
  });
  if (options.labelText) {
    addLabelLayer(map, layerId, sourceId, ["get", "label"], COLOR_PARCEL_LABEL, {
      offset: [0, 0],
      size: 12,
    });
  }
  const bbox = geom.type === "Polygon" ? bboxOfPolygon(geom.coordinates) : undefined;
  return { layerId, message: `polygon 추가됨 (${layerId})`, bbox };
}

function addPointsLayer(map: any, fc: any, layerId: string, color: string): ApplyResult {
  const sourceId = `${layerId}-src`;
  if (map.getSource(sourceId)) return { layerId, message: "이미 존재" };
  const jittered = jitterPointFc(fc);
  map.addSource(sourceId, { type: "geojson", data: jittered });
  map.addLayer({
    id: `${layerId}-pt`,
    type: "circle",
    source: sourceId,
    paint: {
      "circle-color": color,
      "circle-radius": 5,
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 1,
    },
  });
  // POI 라벨: poi_nm > label > big_category 순 우선. 모두 없으면 빈 문자열.
  addLabelLayer(
    map,
    layerId,
    sourceId,
    [
      "coalesce",
      ["get", "poi_nm"],
      ["get", "label"],
      ["get", "big_category"],
      "",
    ],
    COLOR_POI_LABEL,
    { offset: [0, 0.8], size: 11 },
  );
  return { layerId, message: `points ${jittered.features?.length ?? 0}개 추가됨 (${layerId})` };
}

function addLineLayer(map: any, fc: any, layerId: string, color: string): ApplyResult {
  const sourceId = `${layerId}-src`;
  if (map.getSource(sourceId)) return { layerId, message: "이미 존재" };
  map.addSource(sourceId, { type: "geojson", data: fc });
  // dlof_landing 스타일 — 흰 outline 5px + 색 dashed 3px (가독성)
  map.addLayer({
    id: `${layerId}-ln-bg`,
    type: "line",
    source: sourceId,
    paint: { "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.95 },
  });
  map.addLayer({
    id: `${layerId}-ln`,
    type: "line",
    source: sourceId,
    paint: {
      "line-color": color,
      "line-width": 3,
      "line-dasharray": [2, 2],
    },
  });
  // duration / distance 라벨 (LineString placement)
  addLabelLayer(
    map,
    layerId,
    sourceId,
    [
      "case",
      ["has", "duration"],
      ["concat", ["to-string", ["round", ["get", "duration"]]], "분"],
      "",
    ],
    color,
    { offset: [0, 0], size: 12 },
  );
  return { layerId, message: `route 추가됨 (${layerId})` };
}

function addIsochroneFc(map: any, fc: any, layerId: string): ApplyResult {
  const sourceId = `${layerId}-src`;
  if (map.getSource(sourceId)) return { layerId, message: "이미 존재" };
  map.addSource(sourceId, { type: "geojson", data: fc });
  map.addLayer({
    id: `${layerId}-fill`,
    type: "fill",
    source: sourceId,
    paint: { "fill-color": COLOR_ISOCHRONE, "fill-opacity": 0.18 },
  });
  map.addLayer({
    id: `${layerId}-line`,
    type: "line",
    source: sourceId,
    paint: { "line-color": COLOR_ISOCHRONE, "line-width": 2, "line-dasharray": [2, 2] },
  });
  // 라벨: feature.properties.tobreak (초)을 분으로 표기 — "5분 내 도달"
  addLabelLayer(
    map,
    layerId,
    sourceId,
    [
      "case",
      ["has", "tobreak"],
      ["concat", ["to-string", ["round", ["/", ["get", "tobreak"], 60]]], "분 내 도달"],
      ["coalesce", ["get", "name"], ""],
    ],
    COLOR_ISOCHRONE_LABEL,
    { offset: [0, 0], size: 13 },
  );
  return { layerId, message: `등시선 추가됨 (${layerId})` };
}

/** 도구 결과 텍스트를 MapLibre layer로 자동 변환. 인식 못 하면 silent (null). */
export function applyToolResult(map: any, toolName: string, resultText: string): ApplyResult {
  if (!map || !resultText) return { layerId: null, message: "map/result 없음" };
  let raw: any;
  try {
    raw = JSON.parse(resultText);
  } catch {
    return { layerId: null, message: "JSON 파싱 실패" };
  }
  // urban_mcp 도구 결과는 {ok:true, result:{...}} envelope. 일부는 bare(passthrough)도 가능 — 둘 다 처리.
  const parsed: any = raw && raw.ok === true && raw.result ? raw.result : raw;

  // locate__get_parcel — geometry: Polygon (라벨 없음, 위치만 강조)
  if (toolName === "locate__get_parcel") {
    const geom = parsed?.geometry;
    if (isGeometry(geom)) {
      return addPolygonLayer(map, geom, uniqueId("parcel"), COLOR_PARCEL_FILL, COLOR_PARCEL_OUTLINE);
    }
  }
  // locate__parcels_union — { geometry: Polygon }
  if (toolName === "locate__parcels_union") {
    const geom = parsed?.geometry;
    if (isGeometry(geom)) {
      return addPolygonLayer(map, geom, uniqueId("parcels-union"), COLOR_PARCEL_FILL, COLOR_PARCEL_OUTLINE);
    }
  }
  // locate__parcel_at_point — { found: bool, feature: { geometry } } (라벨 없음)
  if (toolName === "locate__parcel_at_point") {
    const geom = parsed?.feature?.geometry;
    if (isGeometry(geom)) {
      return addPolygonLayer(map, geom, uniqueId("parcel-pt"), COLOR_PARCEL_FILL, COLOR_PARCEL_OUTLINE);
    }
  }
  // locate__parcels_in_boundary — FeatureCollection
  if (toolName === "locate__parcels_in_boundary" && parsed?.type === "FeatureCollection") {
    const id = uniqueId("parcels-boundary");
    const sourceId = `${id}-src`;
    map.addSource(sourceId, { type: "geojson", data: parsed });
    map.addLayer({
      id: `${id}-fill`,
      type: "fill",
      source: sourceId,
      paint: { "fill-color": COLOR_AGGREGATION, "fill-opacity": 0.12 },
    });
    map.addLayer({
      id: `${id}-line`,
      type: "line",
      source: sourceId,
      paint: { "line-color": COLOR_AGGREGATION, "line-width": 1 },
    });
    return { layerId: id, message: `필지 ${parsed.features?.length ?? 0}개 추가됨` };
  }
  // reach__isochrone_walk/bike/transit/car — { feature_collection: FeatureCollection }
  if (/^reach__isochrone_(walk|bike|transit|car)$/.test(toolName)) {
    const fc = parsed?.feature_collection;
    if (fc?.type === "FeatureCollection") {
      return addIsochroneFc(map, fc, uniqueId(toolName.replace("reach__", "")));
    }
  }
  // reach__poi_in_radius / poi_in_isochrone — { result: { points: FeatureCollection } } or { points: ... }
  if (toolName === "reach__poi_in_radius" || toolName === "reach__poi_in_isochrone") {
    const points = parsed?.result?.points ?? parsed?.points;
    if (points?.type === "FeatureCollection") {
      return addPointsLayer(map, points, uniqueId("poi"), COLOR_POI);
    }
  }
  // reach__shortest_trip — FeatureCollection (LineString features)
  if (toolName === "reach__shortest_trip" && parsed?.type === "FeatureCollection") {
    return addLineLayer(map, parsed, uniqueId("route"), COLOR_ROUTE);
  }
  // analyze__make_buffer — Polygon (raw geometry)
  if (toolName === "analyze__make_buffer" && isGeometry(parsed)) {
    return addPolygonLayer(map, parsed, uniqueId("buffer"), "transparent", COLOR_BUFFER, {
      outlineDash: [3, 3],
    });
  }
  // analyze__parcel_aggregation — FeatureCollection
  if (toolName === "analyze__parcel_aggregation" && parsed?.type === "FeatureCollection") {
    const id = uniqueId("parcels-agg");
    const sourceId = `${id}-src`;
    map.addSource(sourceId, { type: "geojson", data: parsed });
    map.addLayer({
      id: `${id}-fill`,
      type: "fill",
      source: sourceId,
      paint: { "fill-color": COLOR_AGGREGATION, "fill-opacity": 0.12 },
    });
    map.addLayer({
      id: `${id}-line`,
      type: "line",
      source: sourceId,
      paint: { "line-color": COLOR_AGGREGATION, "line-width": 1 },
    });
    return { layerId: id, message: `필지 집계 추가됨 (${id})` };
  }

  if (toolName === "design__generate_scene") {
    try {
      const parsedDesign = JSON.parse(resultText);
      const result = parsedDesign?.result ?? parsedDesign;
      const sceneData = result?.scene_data;
      const candidates = sceneData?.candidates ?? [];
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return { layerId: null, message: "design.generate_scene: candidates 없음" };
      }
      const layerKey = `${Date.now()}`;
      const r = addMassExtrusion(map, layerKey, candidates);
      if (!r.added) {
        return { layerId: null, message: "design.generate_scene: footprint 누락 — 지도 시각화 skip" };
      }
      return {
        layerId: `mass-${layerKey}`,
        message: `design 매스 ${candidates.length}개 fill-extrusion`,
        bbox: r.bbox,
      };
    } catch (e) {
      return { layerId: null, message: `design 결과 파싱 실패: ${e instanceof Error ? e.message : e}` };
    }
  }

  return { layerId: null, message: `'${toolName}'은 자동 layer 매핑 없음` };
}

/** layer 표시/숨김 토글. */
export function toggleLayer(map: any, layerId: string, visible: boolean): void {
  // sub-layer 접미사 (-fill / -line / -pt / -ln / -ln-bg / -label)를 한꺼번에 토글.
  const suffixes = ["-fill", "-line", "-pt", "-ln", "-ln-bg", "-label"];
  const visibility = visible ? "visible" : "none";
  for (const sfx of suffixes) {
    const id = `${layerId}${sfx}`;
    if (map.getLayer(id)) {
      try { map.setLayoutProperty(id, "visibility", visibility); } catch {}
    }
  }
}

/** layer를 fitBounds로 zoom. bbox는 호출자가 보관. */
export function fitToBbox(map: any, bbox: [number, number, number, number]): void {
  map.fitBounds(bbox, { padding: 60, duration: 600 });
}

/** Layer의 fill opacity 변경 (0~1). fill sub-layer 있는 경우만 적용. */
export function setLayerOpacity(map: any, layerId: string, opacity: number): void {
  const safe = Math.max(0, Math.min(1, opacity));
  const fillLayer = `${layerId}-fill`;
  if (map.getLayer(fillLayer)) {
    try { map.setPaintProperty(fillLayer, "fill-opacity", safe); } catch {}
  }
}

/** Layer가 fill sub-layer를 가지고 있는지 — opacity slider 표시 여부 결정용. */
export function hasFillLayer(map: any, layerId: string): boolean {
  if (!map) return false;
  return !!map.getLayer(`${layerId}-fill`);
}

// === WMS raster helpers (P13) ===

const WMS_BASE_URL = "/geoserver";

function wmsTileUrl(layerName: string, cqlFilter?: string, styles?: string): string {
  const ws = layerName.startsWith("dlof:") ? "/dlof/wms" : "/wms";
  const params = new URLSearchParams({
    service: "WMS",
    version: "1.1.0",
    request: "GetMap",
    layers: layerName,
    styles: styles ?? "",
    format: "image/png",
    transparent: "true",
    srs: "EPSG:3857",
    width: "256",
    height: "256",
    bbox: "{bbox-epsg-3857}",
  });
  if (cqlFilter) params.set("cql_filter", cqlFilter);
  // URLSearchParams가 {bbox-epsg-3857}의 중괄호를 percent-encode하므로 디코드 복원
  const qs = params.toString().replace("%7Bbbox-epsg-3857%7D", "{bbox-epsg-3857}");
  return `${WMS_BASE_URL}${ws}?${qs}`;
}

export function addWmsLayer(
  map: any,
  layerKey: string,
  layerName: string,
  cqlFilter?: string,
  styles?: string,
): void {
  if (!map) return;
  const sourceId = `wms-${layerKey}`;
  const layerId = `wms-${layerKey}`;
  if (map.getLayer(layerId)) return;
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "raster",
      tiles: [wmsTileUrl(layerName, cqlFilter, styles)],
      tileSize: 256,
    });
  }
  map.addLayer({
    id: layerId,
    type: "raster",
    source: sourceId,
    paint: { "raster-opacity": 0.8 },
  });
}

export function removeWmsLayer(map: any, layerKey: string): void {
  if (!map) return;
  const sourceId = `wms-${layerKey}`;
  const layerId = `wms-${layerKey}`;
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

export function setWmsOpacity(map: any, layerKey: string, opacity: number): void {
  if (!map) return;
  const layerId = `wms-${layerKey}`;
  if (!map.getLayer(layerId)) return;
  const clamped = Math.max(0, Math.min(1, opacity));
  map.setPaintProperty(layerId, "raster-opacity", clamped);
}

export function hasWmsLayer(map: any, layerKey: string): boolean {
  if (!map) return false;
  return !!map.getLayer(`wms-${layerKey}`);
}

// === P16 Design mass extrusion ===

const MASS_COLORS = ["#e74c3c", "#3498db", "#2ecc71"]; // 후보별 색상 (반투명)

function _candidateFootprintGeoJSON(candidate: any): GeoJSON.Polygon | null {
  // candidate에 직접 GeoJSON Polygon 형태의 footprint가 있으면 사용. 없으면 null.
  if (candidate?.geometry?.type === "Polygon") return candidate.geometry as GeoJSON.Polygon;
  return null;
}

function _candidateMaxHeight(candidate: any): number {
  return candidate?.metrics?.height ?? 0;
}

export function addMassExtrusion(
  map: any,
  layerKey: string,
  candidates: any[],
): { added: boolean; bbox?: [number, number, number, number] } {
  if (!map) return { added: false };
  const sourceId = `mass-${layerKey}`;
  const layerId = `mass-${layerKey}`;
  if (map.getLayer(layerId)) {
    map.removeLayer(layerId);
  }
  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }

  const features: GeoJSON.Feature[] = [];
  let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
  candidates.forEach((c, idx) => {
    const fp = _candidateFootprintGeoJSON(c);
    if (!fp) return;
    const height = _candidateMaxHeight(c);
    features.push({
      type: "Feature",
      geometry: fp,
      properties: {
        candidate_id: c.id,
        height,
        color: MASS_COLORS[idx % MASS_COLORS.length],
      },
    });
    for (const ring of fp.coordinates) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    }
  });

  if (features.length === 0) return { added: false };

  map.addSource(sourceId, {
    type: "geojson",
    data: { type: "FeatureCollection", features },
  });
  map.addLayer({
    id: layerId,
    type: "fill-extrusion",
    source: sourceId,
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.5,
    },
  });

  return { added: true, bbox: [minLng, minLat, maxLng, maxLat] };
}
