import { fetchJson } from "../cache";
import { snapshot } from "../snapshot";
import { bboxIntersects, bboxCenter } from "../geo";
import type { AreaGeometry, BBox, Poi, PoiSource, Severity } from "../types";

/**
 * EFFIS / Copernicus — périmètres de zones brûlées (Burnt Areas).
 *
 * Couche `fill` du module incendies : les contours des feux récents (≥ ~30 ha, détectés
 * MODIS), en complément des foyers thermiques FIRMS. C'est du **contexte rétrospectif** (ce
 * qui a déjà brûlé), pas une alerte active — donc une couche, pas une source d'incidents.
 *
 * Source vectorielle : WFS GeoJSON sur `maps.effis` (le serveur du Situation Viewer, distinct
 * de `ies-ows` souvent en panne). La fenêtre temporelle est un **filtre OGC sur `FIREDATE`**,
 * pas un nom de couche figé → réglable (`ctx.params.days`, défaut 3, cf. l'UI du module).
 *
 * ⚠️ Le `bbox` WFS de cette couche est buggé (ordre d'axes MapServer → 0 résultat). On récupère
 * donc toute l'Europe (léger : ~200 Ko sur 3 jours) et on filtre la zone visible nous-mêmes.
 */
const WFS = "https://maps.effis.emergency.copernicus.eu/effis";

const DEFAULT_DAYS = 3;
const MAX_DAYS = 30;

/** Surface brûlée (ha) → gravité, pour la couleur du remplissage. */
function areaSeverity(ha: number): Severity {
  if (ha >= 200) return "red";
  if (ha >= 30) return "orange";
  return "yellow";
}

interface BurntFeature {
  geometry: AreaGeometry;
  properties: {
    FIREDATE?: string;
    COUNTRY?: string;
    PROVINCE?: string;
    COMMUNE?: string;
    AREA_HA?: string | number;
  };
}

/** bbox englobante d'un Polygon/MultiPolygon (coords GeoJSON lng,lat). */
function geometryBBox(geom: AreaGeometry): BBox {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
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

/** Nombre de jours demandé, borné. */
function windowDays(ctx: { params?: Record<string, string> }): number {
  const raw = Number(ctx.params?.days);
  if (!Number.isFinite(raw)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(1, Math.round(raw)));
}

function sinceIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Filtre OGC : FIREDATE >= la date de départ de la fenêtre. */
function dateFilter(since: string): string {
  return (
    `<Filter><PropertyIsGreaterThanOrEqualTo><PropertyName>FIREDATE</PropertyName>` +
    `<Literal>${since}</Literal></PropertyIsGreaterThanOrEqualTo></Filter>`
  );
}

/** Un périmètre brûlé normalisé, avec sa bbox pré-calculée. */
export interface BurntPerimeter {
  geometry: AreaGeometry;
  bbox: BBox;
  areaHa: number;
  commune?: string;
  province?: string;
  country?: string;
  fireDate: string;
}

/**
 * Périmètres bruts (échelle européenne) des `days` derniers jours, en cache.
 * Réutilisé par la couche `fill` (ci-dessous) ET par le filtre contextuel FIRMS.
 */
async function fetchBurntPerimeters(
  days: number,
  ttlSeconds: number,
): Promise<BurntPerimeter[]> {
  const since = sinceIso(days);
  return snapshot(`effis-burnt:${days}`, ttlSeconds, async () => {
    const fc = await fetchJson<{ features: BurntFeature[] }>(
      `${WFS}?service=WFS&version=1.1.0&request=GetFeature` +
        `&typename=ms:modis.ba.poly&outputformat=geojson` +
        `&filter=${encodeURIComponent(dateFilter(since))}`,
      undefined,
      // EFFIS est régulièrement lent (mapfile géant) — laisser le temps de répondre.
      45_000,
    );
    return (fc.features ?? []).flatMap((f): BurntPerimeter[] => {
      if (!f.geometry?.coordinates?.length) return [];
      const p = f.properties;
      return [
        {
          geometry: f.geometry,
          bbox: geometryBBox(f.geometry),
          areaHa: Math.round(Number(p.AREA_HA) || 0),
          commune: p.COMMUNE,
          province: p.PROVINCE,
          country: p.COUNTRY,
          fireDate: (p.FIREDATE ?? "").slice(0, 10),
        },
      ];
    });
  });
}

/**
 * Fenêtre fixe pour la validation d'un hotspot : un feu en cours a un périmètre très récent.
 * Alignée sur `DEFAULT_DAYS` (3) — plus fiable (EFFIS timeoute plus souvent sur les grandes
 * fenêtres) et, bonus, **cache partagé** avec la couche quand l'utilisateur la laisse par
 * défaut (`effis-burnt:3`), donc pas de second appel.
 */
const FILTER_WINDOW_DAYS = DEFAULT_DAYS;

/**
 * Périmètres récents pour le filtre contextuel FIRMS (fenêtre fixe, indépendante de l'UI).
 * L'appelant est responsable du fail-soft : si EFFIS ne répond pas, FIRMS garde son seuil
 * normal (voir `firms.ts`).
 */
export function recentBurntPerimeters(): Promise<BurntPerimeter[]> {
  return fetchBurntPerimeters(FILTER_WINDOW_DAYS, 30 * 60);
}

export const effisBurntPoi: PoiSource = {
  id: "effis-burnt",
  label: "Zones brûlées (EFFIS)",
  attribution: "EFFIS / Copernicus EMS",
  ttlSeconds: 30 * 60,
  // Le serveur EFFIS est lent et instable (timeouts fréquents jusqu'à 45 s) : c'est LA source
  // qu'il faut sortir du chemin utilisateur. Ingérée, elle devient instantanée côté web, et
  // ses pannes n'affectent plus que la fraîcheur de la couche.
  scope: "national",
  // Une entrée d'instantané par fenêtre proposée dans l'UI du module : sans ça, seul le
  // défaut (3 j) serait chaud et choisir 30 j rejouerait un appel amont de plusieurs Mo.
  ingestParams: [{ days: "3" }, { days: "7" }, { days: "14" }, { days: "30" }],

  async fetch(ctx): Promise<Poi[]> {
    const days = windowDays(ctx);
    const perims = await fetchBurntPerimeters(days, this.ttlSeconds);

    // La zone visible est filtrée ici (le bbox serveur est inutilisable, cf. en-tête).
    return perims.flatMap((pm): Poi[] => {
      if (!bboxIntersects(pm.bbox, ctx.bbox)) return [];
      const center = bboxCenter(pm.bbox);
      const commune = pm.commune || pm.province || pm.country || "Zone";
      return [
        {
          id: `effis-burnt:${pm.country ?? ""}:${center.lat.toFixed(3)},${center.lng.toFixed(3)}:${pm.fireDate}`,
          layerId: this.id,
          label: `${commune} — ${pm.areaHa} ha brûlés${pm.fireDate ? ` (${pm.fireDate})` : ""}`,
          lat: center.lat,
          lng: center.lng,
          geometry: pm.geometry,
          severity: areaSeverity(pm.areaHa),
          props: {
            areaHa: pm.areaHa,
            commune: pm.commune,
            province: pm.province,
            pays: pm.country,
            fireDate: pm.fireDate,
          },
        },
      ];
    });
  },
};
