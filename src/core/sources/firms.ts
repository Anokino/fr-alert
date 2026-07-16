import { cached, fetchText } from "../cache";
import { FRANCE_BBOX, distanceKm, pointInBBox } from "../geo";
import type {
  Incident,
  IncidentSource,
  LatLng,
  Poi,
  PoiSource,
  Severity,
} from "../types";

/**
 * NASA FIRMS — points chauds détectés par satellite (module `fire`).
 *
 * ⚠️ FIRMS détecte des **anomalies thermiques**, pas des incendies : sur la France, la
 * puissance radiative médiane d'une détection est de 3 MW (usines, torchères, brûlages).
 * Les libellés ne doivent jamais promettre un « incendie ».
 *
 * Deux propriétés de la donnée dictent tout le traitement (mesurées, cf. docs/SOURCES.md) :
 *  1. Un feu = plusieurs pixels, et **VIIRS réplique la puissance du foyer sur chacun** →
 *     on regroupe spatialement et on prend le **max**, jamais la somme (sinon 4 × 203 MW
 *     pour un feu de 203 MW).
 *  2. La confiance ne dit rien de l'intensité (89 % des détections sont « nominal ») →
 *     la gravité vient de la **puissance**.
 *
 * **Auto-réparant** : aucun satellite n'est codé en dur. On demande à FIRMS quels flux sont
 * à jour et on utilise tous les vivants. Motif : `VIIRS_SNPP_NRT` a cessé d'alimenter l'API
 * le 2026-07-10 en renvoyant des CSV **vides** — soit « aucun feu en France », en silence et
 * indéfiniment, pour un adaptateur qui le ciblait en dur. Quand un capteur revient, il est
 * repris sans toucher au code ; s'il n'en reste aucun, `isStale` le signale.
 */
const BASE = "https://firms.modaps.eosdis.nasa.gov";

/** Capteurs de points chauds candidats — même schéma CSV, couverture mondiale. */
const SENSORS = [
  "VIIRS_NOAA20_NRT",
  "VIIRS_NOAA21_NRT",
  "VIIRS_SNPP_NRT",
  "MODIS_NRT",
];

/** Un flux dont la donnée la plus récente dépasse cet âge est considéré mort. */
const MAX_FEED_AGE_DAYS = 2;

/** `day_range` plafonne à 5 côté API, et `1` = jour calendaire (≈ vide à 00h10). */
const DAY_RANGE = 2;
/**
 * Un foyer sans détection plus récente que ça est considéré éteint.
 *
 * ⚠️ Ce filtre s'applique **après** le regroupement, jamais avant : retirer les détections
 * anciennes du nuage de points casse les chaînes et fait éclater un grand incendie en
 * plusieurs foyers. Constaté en vrai sur le feu de Navarre (1093 et 952 MW à 2,7 km : un
 * seul feu, coupé en deux par un filtrage trop précoce).
 */
const MAX_AGE_MS = 24 * 3600 * 1000;

/** Lien entre pixels VIIRS (375 m). Mesuré : étendue p90 d'un foyer = 1,6 km. */
const LINK_VIIRS_KM = 1.5;
/**
 * Lien dès qu'un pixel MODIS est impliqué. MODIS a des pixels d'1 km et une géolocalisation
 * grossière : un même feu y apparaît décalé de 2-3 km par rapport aux pixels VIIRS. Constaté
 * en vrai — le feu de Navarre, vu à 952 MW par VIIRS (91 pixels) et à 1093 MW par MODIS
 * 2,9 km plus loin : un lien serré partout le comptait deux fois.
 */
const LINK_MODIS_KM = 3;
const MODIS = "MODIS_NRT";

function linkKm(a: Detection, b: Detection): number {
  return a.sensor === MODIS || b.sensor === MODIS ? LINK_MODIS_KM : LINK_VIIRS_KM;
}

/**
 * Côté de cellule de la grille d'indexation. Doit couvrir le plus grand rayon de lien même
 * au point le plus au nord de la bbox (~51,5°N, où un degré de longitude ne fait plus que
 * 69 km) : 0,05° y valent ~3,5 km ≥ `LINK_MODIS_KM`.
 */
const CELL_DEG = 0.05;

/** Seuil d'émission (MW). Calibré côté prudence : mieux vaut une torchère qu'un feu manqué. */
const MIN_FRP = 3.5;

function frpSeverity(frp: number): Severity {
  if (frp >= 100) return "red";
  if (frp >= 30) return "orange";
  return "yellow";
}

interface Detection extends LatLng {
  frp: number;
  at: number;
  sensor: string;
}

interface Cluster {
  /** Le plus chaud des points **récents** : c'est là qu'on place l'incident. */
  hottest: Detection;
  /** Intensité courante = max des points récents (jamais la somme, cf. en-tête). */
  frp: number;
  /** Première détection du foyer, fenêtre complète — dit depuis quand il brûle. */
  first: number;
  /** Détection récente la plus fraîche. */
  last: number;
  pixels: number;
  sensors: string[];
}

/** CSV FIRMS : pas de champs entre guillemets. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).flatMap((line) => {
    if (!line.trim()) return [];
    const cols = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cols[i]));
    return [row];
  });
}

/** `acq_date`=2026-07-12 + `acq_time`=1238 → instant UTC. */
function acquiredAt(row: Record<string, string>): number {
  const t = (row.acq_time ?? "0000").padStart(4, "0");
  return Date.parse(`${row.acq_date}T${t.slice(0, 2)}:${t.slice(2)}:00Z`);
}

function todayMinusDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Flux à jour selon FIRMS lui-même (`data_availability` donne `max_date` par flux).
 * C'est ce qui rend l'adaptateur auto-réparant : on n'a aucun avis sur quel satellite vole.
 */
async function liveSensors(key: string): Promise<string[]> {
  return cached("firms:live-sensors", 3600, async () => {
    const rows = parseCsv(await fetchText(`${BASE}/api/data_availability/csv/${key}/ALL`));
    const floor = todayMinusDays(MAX_FEED_AGE_DAYS);
    const live = rows
      .filter((r) => SENSORS.includes(r.data_id) && (r.max_date ?? "") >= floor)
      .map((r) => r.data_id);
    const dead = SENSORS.filter((s) => !live.includes(s));
    if (dead.length) {
      console.warn(`[firms] flux périmés, ignorés : ${dead.join(", ")}`);
    }
    return live;
  });
}

/**
 * Regroupe les détections en groupes spatiaux (lien simple, rayon selon les capteurs, via
 * une grille pour éviter le O(n²) : ~2 200 détections sur la France sur 2 jours en saison).
 * Prend TOUTES les détections de la fenêtre : la recense se fait ensuite (cf. MAX_AGE_MS).
 */
function cluster(dets: Detection[]): Detection[][] {
  const grid = new Map<string, number[]>();
  const cell = (d: Detection) =>
    `${Math.floor(d.lat / CELL_DEG)}:${Math.floor(d.lng / CELL_DEG)}`;
  dets.forEach((d, i) => {
    const k = cell(d);
    const bucket = grid.get(k);
    if (bucket) bucket.push(i);
    else grid.set(k, [i]);
  });

  const neighbours = (d: Detection): number[] => {
    const cy = Math.floor(d.lat / CELL_DEG);
    const cx = Math.floor(d.lng / CELL_DEG);
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const b = grid.get(`${cy + dy}:${cx + dx}`);
        if (b) out.push(...b);
      }
    }
    return out;
  };

  const seen = new Array<boolean>(dets.length).fill(false);
  const groups: Detection[][] = [];

  for (let i = 0; i < dets.length; i++) {
    if (seen[i]) continue;
    seen[i] = true;
    const group: Detection[] = [dets[i]];
    const queue = [i];
    while (queue.length) {
      const cur = dets[queue.pop() as number];
      for (const j of neighbours(cur)) {
        if (seen[j]) continue;
        if (distanceKm(cur, dets[j]) <= linkKm(cur, dets[j])) {
          seen[j] = true;
          group.push(dets[j]);
          queue.push(j);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

/** Résume un groupe en foyer actif, ou l'écarte s'il n'a plus brûlé depuis `MAX_AGE_MS`. */
function summarise(group: Detection[]): Cluster | null {
  const floor = Date.now() - MAX_AGE_MS;
  const recent = group.filter((d) => d.at >= floor);
  if (!recent.length) return null;

  // Max, pas somme : VIIRS réplique la puissance du foyer sur chacun de ses pixels.
  const hottest = recent.reduce((a, b) => (b.frp > a.frp ? b : a));
  return {
    hottest,
    frp: hottest.frp,
    first: Math.min(...group.map((d) => d.at)),
    last: Math.max(...recent.map((d) => d.at)),
    pixels: recent.length,
    sensors: [...new Set(recent.map((d) => d.sensor))].sort(),
  };
}

/**
 * Détections nationales brutes, en cache. Zone fixe et non bbox demandée : sinon deux
 * utilisateurs verraient des foyers différents pour le même feu et les identifiants ne
 * seraient pas stables (ils le doivent — futures notifications).
 */
async function nationalDetections(key: string, ttlSeconds: number): Promise<Detection[]> {
  return cached("firms:detections", ttlSeconds, async () => {
    const sensors = await liveSensors(key);
    if (!sensors.length) return [];

    const area = FRANCE_BBOX.join(",");
    const csvs = await Promise.all(
      sensors.map(async (s) => {
        try {
          return {
            sensor: s,
            csv: await fetchText(`${BASE}/api/area/csv/${key}/${s}/${area}/${DAY_RANGE}`),
          };
        } catch (err) {
          // Un capteur en échec ne doit pas priver l'app des autres.
          console.error(`[firms] capteur ${s}`, err);
          return null;
        }
      }),
    );

    return csvs.flatMap((r) =>
      r === null
        ? []
        : parseCsv(r.csv).flatMap((row): Detection[] => {
            const lat = Number(row.latitude);
            const lng = Number(row.longitude);
            const at = acquiredAt(row);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
            if (!Number.isFinite(at)) return [];
            return [{ lat, lng, frp: Number(row.frp) || 0, at, sensor: r.sensor }];
          }),
    );
  });
}

/** Foyers nationaux : regrouper d'abord (sur tout le nuage), écarter les éteints ensuite. */
async function nationalClusters(key: string, ttlSeconds: number): Promise<Cluster[]> {
  const dets = await nationalDetections(key, ttlSeconds);
  return cached("firms:clusters", ttlSeconds, async () =>
    cluster(dets).flatMap((g) => summarise(g) ?? []),
  );
}

const SENSOR_LABEL: Record<string, string> = {
  VIIRS_NOAA20_NRT: "NOAA-20",
  VIIRS_NOAA21_NRT: "NOAA-21",
  VIIRS_SNPP_NRT: "Suomi-NPP",
  MODIS_NRT: "MODIS",
};

export const firmsSource: IncidentSource = {
  id: "firms",
  label: "NASA FIRMS — Points chauds",
  attribution: "NASA FIRMS (VIIRS / MODIS)",
  ttlSeconds: 15 * 60,
  requiresEnv: "FIRMS_MAP_KEY",

  async fetch(ctx): Promise<Incident[]> {
    const key = process.env.FIRMS_MAP_KEY;
    if (!key) throw new Error("FIRMS_MAP_KEY absente");

    const clusters = await nationalClusters(key, this.ttlSeconds);

    return clusters.flatMap((c): Incident[] => {
      if (c.frp < MIN_FRP) return [];
      if (!pointInBBox(c.hottest, ctx.bbox)) return [];

      const sensors = c.sensors.map((s) => SENSOR_LABEL[s] ?? s).join(", ");
      const passages =
        c.pixels > 1 ? `${c.pixels} points de mesure` : "1 point de mesure";

      return [
        {
          // Stable : le regroupement est national, donc indépendant de la zone demandée.
          id: `firms:${c.hottest.lat.toFixed(2)},${c.hottest.lng.toFixed(2)}`,
          moduleSlug: "fire",
          title: "Foyer thermique détecté par satellite",
          description:
            `Chaleur repérée par ${sensors} (${passages}), puissance ${c.frp.toFixed(0)} MW. ` +
            `Un foyer thermique n'est pas forcément un incendie : il peut s'agir d'un site ` +
            `industriel ou d'un brûlage agricole.`,
          severity: frpSeverity(c.frp),
          lat: c.hottest.lat,
          lng: c.hottest.lng,
          startedAt: new Date(c.first).toISOString(),
          updatedAt: new Date(c.last).toISOString(),
          sourceId: this.id,
          sourceLabel: this.label,
          url: "https://firms.modaps.eosdis.nasa.gov/map/",
          props: {
            frpMw: Math.round(c.frp),
            pixels: c.pixels,
            capteurs: c.sensors.map((s) => SENSOR_LABEL[s] ?? s),
          },
        },
      ];
    });
  },

  /** Plus aucun capteur à jour → un `count: 0` signifierait « aucun feu », ce serait faux. */
  async isStale(): Promise<boolean> {
    const key = process.env.FIRMS_MAP_KEY;
    if (!key) return false;
    return (await liveSensors(key)).length === 0;
  },
};

/**
 * Nappe thermique — les détections **brutes** des dernières 24 h.
 *
 * Ce sont exactement les points que `firmsSource` écarte : trop denses et trop faibles pour
 * alerter (médiane 3 MW = usines, torchères, brûlages), mais c'est précisément ce qui fait
 * une bonne carte de chaleur. Rendue en `heatmap` : ni libellé ni clic, du contexte visuel.
 * Réservée au module incendies — la carte de la home doit rester lisible.
 */
export const firmsHeatPoi: PoiSource = {
  id: "firms-heat",
  label: "Chaleur détectée (24 h)",
  attribution: "NASA FIRMS (VIIRS / MODIS)",
  ttlSeconds: 15 * 60,
  requiresEnv: "FIRMS_MAP_KEY",

  async fetch(ctx): Promise<Poi[]> {
    const key = process.env.FIRMS_MAP_KEY;
    if (!key) throw new Error("FIRMS_MAP_KEY absente");

    const floor = Date.now() - MAX_AGE_MS;
    const dets = await nationalDetections(key, this.ttlSeconds);

    return dets.flatMap((d): Poi[] => {
      if (d.at < floor || !pointInBBox(d, ctx.bbox)) return [];
      return [
        {
          id: `firms-heat:${d.sensor}:${d.at}:${d.lat.toFixed(4)},${d.lng.toFixed(4)}`,
          layerId: this.id,
          label: `${d.frp.toFixed(0)} MW`,
          lat: d.lat,
          lng: d.lng,
          props: { frp: d.frp },
        },
      ];
    });
  },
};
