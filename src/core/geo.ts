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

/** Deux bbox se chevauchent-elles ? (test de recouvrement de rectangles) */
export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** Point dans un anneau (ray casting). `ring` = liste de [lng, lat]. */
function pointInRing(p: LatLng, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > p.lat !== yj > p.lat &&
      p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Point dans un polygone (anneau extérieur, hors trous). `rings` = [extérieur, ...trous]. */
function pointInRings(p: LatLng, rings: number[][][]): boolean {
  if (!rings.length || !pointInRing(p, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(p, rings[i])) return false; // dans un trou
  }
  return true;
}

type PolyGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

/** Point dans une géométrie Polygon / MultiPolygon (coords GeoJSON lng,lat). */
export function pointInPolygon(p: LatLng, geom: PolyGeometry): boolean {
  return geom.type === "Polygon"
    ? pointInRings(p, geom.coordinates)
    : geom.coordinates.some((poly) => pointInRings(p, poly));
}

/** Distance (km) d'un point à un segment [a,b], projection équirectangulaire locale. */
function segmentDistanceKm(p: LatLng, a: number[], b: number[]): number {
  const kx = 111.32 * Math.cos(toRad(p.lat));
  const ky = 111.32;
  const px = p.lng * kx;
  const py = p.lat * ky;
  const ax = a[0] * kx;
  const ay = a[1] * ky;
  const dx = b[0] * kx - ax;
  const dy = b[1] * ky - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Le point est-il dans le polygone OU à moins de `km` de son bord ?
 *
 * La tolérance est indispensable pour rapprocher deux données décalées : un périmètre de feu
 * (zone déjà brûlée, cartographiée la veille) et un hotspot satellite (front actif, qui a
 * progressé, + géoloc imprécise ~1 km). Sans buffer, ils ne coïncident presque jamais.
 */
export function pointWithinKmOfPolygon(
  p: LatLng,
  geom: PolyGeometry,
  km: number,
): boolean {
  if (pointInPolygon(p, geom)) return true;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const rings of polys) {
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        if (segmentDistanceKm(p, ring[i - 1], ring[i]) <= km) return true;
      }
    }
  }
  return false;
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
