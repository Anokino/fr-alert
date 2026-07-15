import { cached, fetchText } from "../cache";
import { bboxCenter } from "../geo";
import { reverseCommune } from "../geocode";
import type { Incident, IncidentSource, Severity } from "../types";

/**
 * Météo-France — Météo des forêts : danger de feu de forêt par département.
 *
 * Rattachée au module `weather`, PAS `fire` : la fiche produit officielle précise
 * elle-même que « la Météo des forêts n'est pas une carte des incendies en cours ou à
 * venir ». C'est une prévision météo (comme la Vigilance) ; `fire` reste dédié aux feux
 * réels et en direct. Les incidents émis portent donc `forecast: true` et n'allument pas
 * le beacon de la home.
 *
 * ⚠️ Le flux est du **CSV** (`text/csv`), pas du JSON — le catalogue ne le précise pas.
 * ⚠️ Produit **saisonnier** : diffusé du 3 juin à l'automne seulement. Hors saison, un flux
 *    vide ou périmé est un cas nominal, pas une panne (cf. `isFresh`).
 *
 * Auth : en-tête `apikey:` (cf. docs/SOURCES.md). Diffusion quotidienne vers 17h.
 */
const CARTE_URL =
  "https://public-api.meteofrance.fr/public/DPMeteoForets/v1/carte/encours";

/** Échelle officielle à 4 niveaux → gravité (même code couleur que la Vigilance). */
const NIVEAU_SEVERITY: Record<number, Severity> = {
  1: "green", // faible
  2: "yellow", // modéré
  3: "orange", // élevé
  4: "red", // très élevé
};

const NIVEAU_LABEL: Record<number, string> = {
  1: "faible",
  2: "modéré",
  3: "élevé",
  4: "très élevé",
};

interface DangerRow {
  referenceTime: string;
  dep: string;
  niveauJ1: number;
  niveauJ2: number;
  depNom: string;
}

/**
 * `reference_time;dep_code;niveau_j1;niveau_j2;dep_nom` — 96 lignes (dont 2A/2B).
 * Les lignes illisibles sont ignorées plutôt que de faire échouer tout le département.
 */
function parseCsv(csv: string): DangerRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines.shift();
  if (!header?.includes("dep_code")) {
    throw new Error("Météo des forêts : en-tête CSV inattendu");
  }
  return lines.flatMap((line): DangerRow[] => {
    const [referenceTime, dep, j1, j2, depNom] = line.split(";");
    const niveauJ1 = Number(j1);
    const niveauJ2 = Number(j2);
    if (!dep || !Number.isFinite(niveauJ1)) return [];
    return [{ referenceTime, dep, niveauJ1, niveauJ2, depNom: depNom ?? dep }];
  });
}

/** Hors saison (~automne → 3 juin), le dernier flux diffusé peut traîner : on l'ignore. */
const MAX_AGE_MS = 48 * 3600 * 1000;

function isFresh(referenceTime: string): boolean {
  const t = Date.parse(referenceTime);
  return Number.isFinite(t) && Date.now() - t < MAX_AGE_MS;
}

/**
 * Les jours de ce produit sont des jours **français** (« diffusée chaque jour à 17h heures
 * locales »). Tout le calcul d'échéance se fait donc en Europe/Paris : en UTC, entre minuit
 * et 2h du matin, on serait encore la veille et on annoncerait « demain » pour aujourd'hui.
 */
const PARIS_TZ = "Europe/Paris";

/** Jour civil français (AAAA-MM-JJ) d'un instant. */
function parisDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Décale un jour civil de n jours (ancré à midi UTC : insensible aux changements d'heure). */
function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000,
  );
}

/** Instant de 00:00 heure de Paris pour un jour civil donné. */
function parisDayStart(day: string): string {
  const noonUtc = new Date(`${day}T12:00:00Z`);
  const hourInParis = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: PARIS_TZ,
      hour: "2-digit",
      hour12: false,
    }).format(noonUtc),
  );
  return new Date(noonUtc.getTime() - hourInParis * 3_600_000).toISOString();
}

/**
 * Jour civil visé par `niveau_j1`.
 *
 * ⚠️ Piège : « J+1 » est relatif à la **date de diffusion du produit**, pas à maintenant.
 * Le produit n'étant réédité que vers 17h, de minuit à 17h le dernier disponible est celui
 * de la veille — son « J+1 » désigne donc **aujourd'hui**. Calculer l'échéance depuis
 * `Date.now()` afficherait « demain » à tort les deux tiers de la journée.
 */
function j1Day(referenceTime: string): string | null {
  const t = Date.parse(referenceTime);
  if (!Number.isFinite(t)) return null;
  return shiftDay(parisDay(new Date(t)), 1);
}

/** « aujourd'hui » / « demain » / date explicite au-delà. */
function relativeDay(day: string): string {
  const days = dayDiff(day, parisDay(new Date()));
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "demain";
  return `le ${new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })}`;
}

export const meteoFranceForetsSource: IncidentSource = {
  id: "meteofrance-forets",
  label: "Météo-France — Météo des forêts",
  attribution: "Météo-France",
  ttlSeconds: 60 * 60,
  requiresEnv: "METEOFRANCE_TOKEN",

  async fetch(ctx): Promise<Incident[]> {
    const center = ctx.center ?? bboxCenter(ctx.bbox);

    // Produit départemental : on part de la commune de l'utilisateur.
    // `null` = hors de France → rien à afficher (une panne, elle, remonte).
    const commune = await reverseCommune(center);
    const dept = commune?.codeDepartement;
    if (!dept) return [];

    // Flux national → mis en cache une seule fois, indépendamment de la bbox.
    const rows = await cached("meteofrance-forets:carte", this.ttlSeconds, async () => {
      const token = process.env.METEOFRANCE_TOKEN;
      if (!token) throw new Error("METEOFRANCE_TOKEN absente");
      return parseCsv(await fetchText(CARTE_URL, { headers: { apikey: token } }));
    });

    const row = rows.find((r) => r.dep === dept);
    if (!row || !isFresh(row.referenceTime)) return [];

    const echeance = j1Day(row.referenceTime);
    if (!echeance) return [];

    const severity = NIVEAU_SEVERITY[row.niveauJ1];
    // Faible = pas de risque à signaler ; niveau inconnu = on ignore plutôt que de deviner.
    if (!severity || severity === "green") return [];

    const quand = relativeDay(echeance);
    const niveau = NIVEAU_LABEL[row.niveauJ1];

    return [
      {
        id: `meteofrance-forets:${dept}`,
        moduleSlug: "weather",
        title: `Danger de feu ${niveau} ${quand} — ${row.depNom}`,
        description: `Météo des forêts : danger de feu de forêt ${niveau} annoncé ${quand} sur ${row.depNom}. Ce n'est pas un incendie en cours — 9 départs de feu sur 10 sont d'origine humaine.`,
        severity,
        lat: center.lat,
        lng: center.lng,
        // Indicateur de prévention, jamais un incident en cours : Météo-France précise que
        // « la Météo des forêts n'est pas une carte des incendies en cours ou à venir ».
        // Exclu du beacon et du compteur de la home, quelle que soit l'échéance.
        forecast: true,
        startedAt: parisDayStart(echeance),
        updatedAt: row.referenceTime,
        sourceId: this.id,
        sourceLabel: this.label,
        url: "https://meteofrance.com/meteo-des-forets",
        props: {
          departement: dept,
          departementNom: row.depNom,
          niveauJ1: row.niveauJ1,
          niveauJ1Label: NIVEAU_LABEL[row.niveauJ1],
          niveauJ2: row.niveauJ2,
          niveauJ2Label: NIVEAU_LABEL[row.niveauJ2] ?? null,
        },
      },
    ];
  },
};
