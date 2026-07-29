import { fetchJson } from "../cache";
import { snapshot } from "../snapshot";
import { bboxCenter, distanceKm, pointInBBox } from "../geo";
import type { Incident, IncidentSource, LatLng, Severity } from "../types";

/**
 * Vigicrues — vigilance crues par tronçon de cours d'eau (SCHAPI).
 *
 * Flux GeoJSON national, keyless, référencé sur data.gouv.fr. Chaque feature est un
 * tronçon (MultiLineString) portant son niveau de vigilance `NivInfViCr` (1..4).
 * NB : l'ancien chemin `/services/1/InfoVigiCru.jsonld` répond 404 ; la forme qui
 * fonctionne est `.geojson` (redirige vers /services/InfoVigiCru.geojson).
 */
const FEED_URL = "https://www.vigicrues.gouv.fr/services/1/InfoVigiCru.geojson/";

/** Niveau Vigicrues → échelle Vigilance FR. */
const NIVEAU_SEVERITY: Record<number, Severity> = {
  1: "green",
  2: "yellow",
  3: "orange",
  4: "red",
};

interface TronconFeature {
  properties: {
    /** Code entité, ex. "CO1" — stable, sert d'id et de lien vers la fiche. */
    CdEntCru?: string;
    /** Libellé du tronçon, ex. "Golo aval". */
    lbentcru?: string;
    /** Niveau de vigilance crue : 1 vert, 2 jaune, 3 orange, 4 rouge. */
    NivInfViCr?: number;
  };
  geometry: { type: string; coordinates: number[][][] };
}

interface VigicruesFeed {
  features?: TronconFeature[];
  /** Horodatage du bulletin, ex. "2026-07-15T13:55:38+00:00". */
  DtHrInfoVigiCru?: string;
  /** Référence du bulletin, ex. "15072026_16". */
  RefInfoVigiCru?: string;
}

/** Tronçon en vigilance, réduit à ce dont on a besoin (cf. `activeTroncons`). */
interface ActiveTroncon {
  code: string;
  label: string;
  severity: Severity;
  niveau: number;
  points: LatLng[];
  bulletinAt: string;
  bulletinRef?: string;
}

/**
 * Récupère le flux et ne conserve QUE les tronçons en vigilance (niveau >= 2).
 * Le flux national pèse ~2 Mo ; hors épisode de crue tout est vert, donc ce filtrage
 * amont évite de garder les géométries de 337 tronçons en mémoire pour rien.
 */
async function activeTroncons(ttlSeconds: number): Promise<ActiveTroncon[]> {
  return snapshot("vigicrues:actifs", ttlSeconds, async () => {
    const feed = await fetchJson<VigicruesFeed>(FEED_URL);
    const bulletinAt = feed.DtHrInfoVigiCru ?? new Date().toISOString();

    return (feed.features ?? []).flatMap((f): ActiveTroncon[] => {
      const niveau = f.properties.NivInfViCr ?? 1;
      const severity = NIVEAU_SEVERITY[niveau];
      // Vert = pas d'incident ; niveau inconnu = on ignore plutôt que de deviner.
      if (!severity || severity === "green") return [];

      const code = f.properties.CdEntCru;
      if (!code) return [];

      const points = f.geometry.coordinates
        .flat()
        .filter(
          (c): c is [number, number] =>
            Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]),
        )
        .map(([lng, lat]) => ({ lat, lng }));
      if (!points.length) return [];

      return [
        {
          code,
          label: f.properties.lbentcru ?? "Tronçon",
          severity,
          niveau,
          points,
          bulletinAt,
          bulletinRef: feed.RefInfoVigiCru,
        },
      ];
    });
  });
}

const NIVEAU_TEXTE: Record<number, string> = {
  2: "jaune",
  3: "orange",
  4: "rouge",
};

export const vigicruesSource: IncidentSource = {
  id: "vigicrues",
  label: "Vigicrues — Vigilance crues",
  attribution: "Vigicrues · SCHAPI (Licence ouverte)",
  // Le bulletin est réédité au moins toutes les heures (réf. datée à l'heure).
  ttlSeconds: 10 * 60,
  // Flux national de ~2 Mo, filtré par bbox ensuite → ingérable d'avance.
  scope: "national",

  async fetch(ctx): Promise<Incident[]> {
    const troncons = await activeTroncons(this.ttlSeconds);
    const center = ctx.center ?? bboxCenter(ctx.bbox);

    return troncons.flatMap((t): Incident[] => {
      // Un tronçon est un linéaire : on le retient s'il traverse la bbox, et on le
      // place au point du cours d'eau le plus proche de l'utilisateur.
      const inside = t.points.filter((p) => pointInBBox(p, ctx.bbox));
      if (!inside.length) return [];

      const at = inside.reduce((best, p) =>
        distanceKm(center, p) < distanceKm(center, best) ? p : best,
      );

      return [
        {
          id: `vigicrues:${t.code}`,
          moduleSlug: "flood",
          title: `Vigilance crue ${NIVEAU_TEXTE[t.niveau]} — ${t.label}`,
          description: `Le tronçon « ${t.label} » est placé en vigilance crue ${NIVEAU_TEXTE[t.niveau]} par Vigicrues.`,
          severity: t.severity,
          lat: at.lat,
          lng: at.lng,
          startedAt: t.bulletinAt,
          updatedAt: t.bulletinAt,
          sourceId: this.id,
          sourceLabel: this.label,
          url: `https://www.vigicrues.gouv.fr/?CdEntVigiCru=${encodeURIComponent(t.code)}`,
          props: {
            troncon: t.label,
            code: t.code,
            niveau: t.niveau,
            bulletinRef: t.bulletinRef,
          },
        },
      ];
    });
  },
};
