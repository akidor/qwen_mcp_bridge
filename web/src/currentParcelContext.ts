import type { ParcelRecord } from "./types/parcel";

export interface CurrentParcelContext {
  address?: string;
  centroid?: { lng: number; lat: number };
  pnu?: string;
}

let currentParcelContext: CurrentParcelContext | null = null;

export function setCurrentParcelContextFromParcel(parcel: ParcelRecord): void {
  currentParcelContext = compactParcelContext(parcel);
}

export function getCurrentParcelContext(): CurrentParcelContext | null {
  return currentParcelContext;
}

function compactParcelContext(parcel: ParcelRecord): CurrentParcelContext | null {
  const address = cleanText(parcel.address);
  const pnu = cleanText(parcel.pnu);
  const centroid = centroidFromBbox(parcel.bbox) ?? centroidFromGeometry(parcel.geometry);
  const context: CurrentParcelContext = {};
  if (address) context.address = address;
  if (centroid) context.centroid = centroid;
  if (pnu) context.pnu = pnu;
  return Object.keys(context).length > 0 ? context : null;
}

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/[\r\n]+/g, " ").trim();
  return cleaned || undefined;
}

function centroidFromBbox(bbox: [number, number, number, number] | undefined): { lng: number; lat: number } | undefined {
  if (!bbox) return undefined;
  const [minLng, minLat, maxLng, maxLat] = bbox;
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return undefined;
  return {
    lng: (minLng + maxLng) / 2,
    lat: (minLat + maxLat) / 2,
  };
}

function centroidFromGeometry(geometry: any): { lng: number; lat: number } | undefined {
  const bbox = bboxFromCoordinates(geometry?.coordinates);
  return centroidFromBbox(bbox);
}

function bboxFromCoordinates(coords: any): [number, number, number, number] | undefined {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  function visit(value: any) {
    if (Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number") {
      const [lng, lat] = value;
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
    }
  }

  visit(coords);
  if (!Number.isFinite(minLng)) return undefined;
  return [minLng, minLat, maxLng, maxLat];
}
