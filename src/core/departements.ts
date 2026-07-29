import { fetchJson } from "./cache";
import { snapshot } from "./snapshot";
import type { AreaGeometry, BBox } from "./types";

/**
 * Contours des départements français (métropole + Corse), version simplifiée.
 *
 * Frontières administratives : statiques, sans clé. Chargées une fois puis mises en cache
 * longtemps. Servent aux couches `fill` (zones de vigilance…) : on n'envoie au client que
 * les contours des départements concernés, jamais les 96.
 *
 * ⚠️ Dépendance réseau à `raw.githubusercontent.com`. Fail-soft (la couche dégrade), mais à
 * self-host à terme comme les polices (cf. docs/ROADMAP.md).
 */
const CONTOURS_URL =
  "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson";

export interface DeptContour {
  code: string;
  nom: string;
  geometry: AreaGeometry;
  /** [minLng, minLat, maxLng, maxLat] — pré-calculée pour filtrer par zone visible. */
  bbox: BBox;
}

interface DeptFeature {
  properties: { code: string; nom: string };
  geometry: AreaGeometry;
}

/** bbox englobante d'une géométrie Polygon/MultiPolygon. */
function geometryBBox(geom: AreaGeometry): BBox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  // Polygon → rings ; MultiPolygon → polygons → rings. On aplatit jusqu'aux [lng, lat].
  const rings =
    geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLng, minLat, maxLng, maxLat];
}

export async function departementContours(
  ttlSeconds: number,
): Promise<DeptContour[]> {
  // Instantané : 555 Ko statiques, partagés par toutes les couches `fill`. Le worker les
  // charge une fois par jour, le web ne touche donc jamais raw.githubusercontent.com.
  return snapshot("dept-contours", ttlSeconds, async () => {
    const fc = await fetchJson<{ features: DeptFeature[] }>(CONTOURS_URL);
    return (fc.features ?? []).map((f) => ({
      code: f.properties.code,
      nom: f.properties.nom,
      geometry: f.geometry,
      bbox: geometryBBox(f.geometry),
    }));
  });
}
