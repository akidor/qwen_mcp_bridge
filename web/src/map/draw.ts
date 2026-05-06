import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

export function createDraw(): MapboxDraw {
  return new MapboxDraw({
    displayControlsDefault: false,
    controls: {
      polygon: true,
      line_string: true,
      point: true,
      trash: true,
    },
    defaultMode: "simple_select",
  });
}

export function geomToLabel(geom: GeoJSON.Geometry): string {
  if (geom.type === "Polygon") {
    const m2 = approxPolygonAreaM2(geom.coordinates[0] as [number, number][]);
    return `면적 ${m2.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}㎡`;
  }
  if (geom.type === "LineString") {
    const m = approxLineLengthM(geom.coordinates as [number, number][]);
    return `라인 ${m.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}m`;
  }
  if (geom.type === "Point") {
    return `지점 (${(geom.coordinates as number[])[0].toFixed(5)}, ${(geom.coordinates as number[])[1].toFixed(5)})`;
  }
  return geom.type;
}

const EARTH_R = 6378137;

function approxPolygonAreaM2(ring: [number, number][]): number {
  if (ring.length < 4) return 0;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += toRad(x2 - x1) * (2 + Math.sin(toRad(y1)) + Math.sin(toRad(y2)));
  }
  return Math.abs((area * EARTH_R * EARTH_R) / 2);
}

function approxLineLengthM(coords: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversine(coords[i], coords[i + 1]);
  }
  return total;
}

function haversine(a: [number, number], b: [number, number]): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
