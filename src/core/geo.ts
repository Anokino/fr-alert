import type { BBox, LatLng } from "./types";

/** Centre géographique approximatif de la France métropolitaine (fallback géoloc). */
export const FRANCE_CENTER: LatLng = { lat: 46.6, lng: 2.4 };

/** BBox englobant la métropole (fallback). */
export const FRANCE_BBOX: BBox = [-5.5, 41.2, 9.8, 51.5];

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distance haversine en km entre deux points. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** BBox carré (approx.) de rayon `radiusKm` autour d'un centre. */
export function bboxAround(center: LatLng, radiusKm: number): BBox {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos(toRad(center.lat)) || 1);
  return [
    center.lng - dLng,
    center.lat - dLat,
    center.lng + dLng,
    center.lat + dLat,
  ];
}

export function bboxCenter(bbox: BBox): LatLng {
  return { lat: (bbox[1] + bbox[3]) / 2, lng: (bbox[0] + bbox[2]) / 2 };
}

export function pointInBBox(p: LatLng, bbox: BBox): boolean {
  return (
    p.lng >= bbox[0] && p.lng <= bbox[2] && p.lat >= bbox[1] && p.lat <= bbox[3]
  );
}

/** Parse "minLng,minLat,maxLng,maxLat" en BBox validée, ou null. */
export function parseBBox(raw: string | null): BBox | null {
  if (!raw) return null;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts;
  if (minLng > maxLng || minLat > maxLat) return null;
  return [minLng, minLat, maxLng, maxLat];
}

/** Format bbox pour les APIs qui attendent "minLat,minLng,maxLat,maxLng". */
export function bboxLatLngStr(bbox: BBox): string {
  return `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;
}
