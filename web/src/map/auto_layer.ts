/** Tool 결과 텍스트(JSON)를 파싱해 MapLibre source/layer로 자동 추가. */

const COLOR_PARCEL_FILL = "#7c3aed";
const COLOR_PARCEL_OUTLINE = "#5b21b6";
const COLOR_ISOCHRONE = "#22c55e";
const COLOR_POI = "#0ea5e9";
const COLOR_ROUTE = "#f59e0b";
const COLOR_BUFFER = "#a8a29e";
const COLOR_AGGREGATION = "#737373";

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

function addPolygonLayer(map: any, geom: Geom, layerId: string, fillColor: string, outlineColor: string, outlineDash?: number[]): ApplyResult {
  const sourceId = `${layerId}-src`;
  if (map.getSource(sourceId)) return { layerId, message: "이미 존재" };
  map.addSource(sourceId, {
    type: "geojson",
    data: { type: "Feature", properties: {}, geometry: geom },
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
      ...(outlineDash ? { "line-dasharray": outlineDash } : {}),
    },
  });
  const bbox = geom.type === "Polygon" ? bboxOfPolygon(geom.coordinates) : undefined;
  return { layerId, message: `polygon 추가됨 (${layerId})`, bbox };
}

function addPointsLayer(map: any, fc: any, layerId: string, color: string): ApplyResult {
  const sourceId = `${layerId}-src`;
  if (map.getSource(sourceId)) return { layerId, message: "이미 존재" };
  map.addSource(sourceId, { type: "geojson", data: fc });
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
  return { layerId, message: `points 추가됨 (${layerId})` };
}

function addLineLayer(map: any, fc: any, layerId: string, color: string): ApplyResult {
  const sourceId = `${layerId}-src`;
  if (map.getSource(sourceId)) return { layerId, message: "이미 존재" };
  map.addSource(sourceId, { type: "geojson", data: fc });
  map.addLayer({
    id: `${layerId}-ln`,
    type: "line",
    source: sourceId,
    paint: { "line-color": color, "line-width": 3 },
  });
  return { layerId, message: `line 추가됨 (${layerId})` };
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

  // locate__get_parcel — geometry: Polygon
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
  // locate__parcel_at_point — { found: bool, feature: { geometry } }
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
      const id = uniqueId(toolName.replace("reach__", ""));
      const sourceId = `${id}-src`;
      map.addSource(sourceId, { type: "geojson", data: fc });
      map.addLayer({
        id: `${id}-fill`,
        type: "fill",
        source: sourceId,
        paint: { "fill-color": COLOR_ISOCHRONE, "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: `${id}-line`,
        type: "line",
        source: sourceId,
        paint: { "line-color": COLOR_ISOCHRONE, "line-width": 2, "line-dasharray": [2, 2] },
      });
      return { layerId: id, message: `등시선 추가됨 (${id})` };
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
    return addPolygonLayer(map, parsed, uniqueId("buffer"), "transparent", COLOR_BUFFER, [3, 3]);
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

  return { layerId: null, message: `'${toolName}'은 자동 layer 매핑 없음` };
}

/** layer 표시/숨김 토글. */
export function toggleLayer(map: any, layerId: string, visible: boolean): void {
  // layerId-fill / -line / -pt / -ln 등 sub-layer를 한꺼번에 토글
  const suffixes = ["-fill", "-line", "-pt", "-ln"];
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
