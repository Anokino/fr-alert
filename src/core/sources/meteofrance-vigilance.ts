import { cached, fetchJson } from "../cache";
import { bboxCenter } from "../geo";
import { reverseCommune } from "../geocode";
import type { Incident, IncidentSource, Severity } from "../types";

/**
 * Météo-France Vigilance — produit « carte » (DPVigilance).
 *
 * Vigilance officielle par département, jour J et J+1, sur les 9 phénomènes. C'est la
 * source de référence de l'échelle de gravité du projet : `color_id` 1..4 EST notre
 * `Severity`, sans traduction.
 *
 * Auth : en-tête `apikey: <token>` (le Bearer est refusé — vérifié en direct).
 * Un seul `METEOFRANCE_TOKEN` couvre les 3 APIs du portail (cf. docs/SOURCES.md).
 *
 * Le produit est national : on le met en cache UNE fois (clé non liée à la bbox), les deux
 * modules qui l'utilisent partagent donc le même appel.
 */
const CARTE_URL =
  "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours";

/** `color_id` → gravité. Table officielle (descriptif technique Météo-France). */
const COLOR_SEVERITY: Record<number, Severity> = {
  1: "green",
  2: "yellow",
  3: "orange",
  4: "red",
};

/**
 * `phenomenon_id` → libellé. Table officielle du descriptif technique ; les libellés
 * retenus sont ceux du vocabulaire public Vigilance (l'API elle-même renvoie « Canicule »
 * pour l'aléa 6 dans `hazard_name`).
 */
const PHENOMENON_LABEL: Record<string, string> = {
  "1": "Vent violent",
  "2": "Pluie-inondation",
  "3": "Orages",
  "4": "Crues",
  "5": "Neige-verglas",
  "6": "Canicule",
  "7": "Grand froid",
  "8": "Avalanches",
  "9": "Vagues-submersion",
};

/**
 * Répartition des phénomènes entre modules.
 *
 * Le phénomène « crues » (4) est volontairement ABSENT : Vigicrues le couvre déjà au
 * tronçon de cours d'eau près, là où la Vigilance ne donne qu'un niveau départemental.
 * L'émettre ici afficherait deux incidents pour un seul danger et gonflerait le compteur
 * de la home (principe produit n°1 : un verdict clair).
 */
const MODULE_PHENOMENA: Record<string, string[]> = {
  // « Pluie-inondation » = ruissellement / crues rapides : distinct des crues Vigicrues.
  flood: ["2"],
  // 8 (avalanches) restera ici jusqu'à la création du module dédié (cf. ROADMAP).
  weather: ["1", "3", "5", "6", "7", "8", "9"],
};

interface PhenomenonItem {
  phenomenon_id: string;
  /** À utiliser : pour les crues, `timelaps_items` est TOUJOURS vide (documenté). */
  phenomenon_max_color_id: number;
}
interface DomainItem {
  domain_id: string;
  max_color_id: number;
  phenomenon_items: PhenomenonItem[];
}
interface Period {
  /** "J" (aujourd'hui) ou "J1" (demain). */
  echeance: string;
  begin_validity_time?: string;
  end_validity_time?: string;
  timelaps?: { domain_ids: DomainItem[] };
}
interface CarteVigilance {
  product?: {
    update_time?: string;
    periods?: Period[];
  };
}

function fetchCarte(ttlSeconds: number): Promise<CarteVigilance> {
  return cached("meteofrance-vigilance:carte", ttlSeconds, () => {
    const token = process.env.METEOFRANCE_TOKEN;
    if (!token) throw new Error("METEOFRANCE_TOKEN absente");
    return fetchJson<CarteVigilance>(CARTE_URL, { headers: { apikey: token } });
  });
}

export function makeMeteoFranceVigilance(
  moduleSlug: "weather" | "flood",
): IncidentSource {
  return {
    id: `meteofrance-vigilance-${moduleSlug}`,
    label: "Météo-France — Vigilance",
    attribution: "Météo-France",
    ttlSeconds: 30 * 60,
    requiresEnv: "METEOFRANCE_TOKEN",

    async fetch(ctx): Promise<Incident[]> {
      const center = ctx.center ?? bboxCenter(ctx.bbox);

      // La Vigilance est départementale : on part de la commune de l'utilisateur.
      // `null` = hors de France → pas de vigilance à afficher (une panne, elle, remonte).
      const commune = await reverseCommune(center);
      const dept = commune?.codeDepartement;
      if (!dept) return [];

      const carte = await fetchCarte(this.ttlSeconds);

      // Période J = la vigilance en cours. J1 existe aussi, mais c'est une prévision : la
      // home répond « maintenant ». NB : entre 0h et 6h locales, J est le SEUL bloc émis.
      const periodJ = carte.product?.periods?.find((p) => p.echeance === "J");
      const domain = periodJ?.timelaps?.domain_ids?.find(
        (d) => d.domain_id === dept,
      );
      if (!domain) return [];

      const wanted = MODULE_PHENOMENA[moduleSlug] ?? [];

      return domain.phenomenon_items.flatMap((p): Incident[] => {
        if (!wanted.includes(p.phenomenon_id)) return [];

        const severity = COLOR_SEVERITY[p.phenomenon_max_color_id];
        // Vert = pas de vigilance ; couleur inconnue = on ignore plutôt que de deviner.
        if (!severity || severity === "green") return [];

        const label = PHENOMENON_LABEL[p.phenomenon_id];
        if (!label) return [];

        const colorName = { yellow: "jaune", orange: "orange", red: "rouge" }[
          severity
        ];

        return [
          {
            id: `meteofrance-vigilance:${dept}:${p.phenomenon_id}`,
            moduleSlug,
            title: `Vigilance ${colorName} — ${label}`,
            description: `${label} : vigilance ${colorName} en cours sur ${commune.nom} (département ${dept}).`,
            severity,
            lat: center.lat,
            lng: center.lng,
            startedAt:
              periodJ?.begin_validity_time ??
              carte.product?.update_time ??
              new Date().toISOString(),
            updatedAt: carte.product?.update_time,
            sourceId: this.id,
            sourceLabel: this.label,
            url: "https://vigilance.meteofrance.fr/fr",
            props: {
              phenomene: label,
              phenomenonId: p.phenomenon_id,
              departement: dept,
              commune: commune.nom,
              colorId: p.phenomenon_max_color_id,
              echeance: "J",
            },
          },
        ];
      });
    },
  };
}
