import { fetchJson } from "../cache";
import { snapshot } from "../snapshot";
import { FRANCE_CENTER } from "../geo";
import type { Incident, IncidentSource, Severity } from "../types";

interface RappelRecord {
  libelle?: string;
  categorie_produit?: string;
  sous_categorie_produit?: string;
  risques_encourus?: string;
  motif_rappel?: string;
  date_publication?: string;
  marque_produit?: string;
  zone_geographique_de_vente?: string;
  lien_vers_la_fiche_rappel?: string;
}
interface RappelResponse {
  total_count: number;
  results: RappelRecord[];
}

const HIGH_RISK =
  /listeria|salmonell|botulism|e\.?\s?coli|escherichia|toxi|allerg|étouffement|blessure/i;

function recallSeverity(r: RappelRecord): Severity {
  const risk = `${r.risques_encourus ?? ""} ${r.motif_rappel ?? ""}`;
  return HIGH_RISK.test(risk) ? "red" : "orange";
}

export const rappelConsoSource: IncidentSource = {
  id: "rappelconso",
  label: "RappelConso — Rappels de produits",
  attribution: "RappelConso · DGCCRF",
  ttlSeconds: 60 * 60,
  // Rappels nationaux : la donnée est la même pour tout le monde.
  scope: "national",

  async fetch(): Promise<Incident[]> {
    const data = await snapshot("rappelconso:latest", this.ttlSeconds, () =>
      fetchJson<RappelResponse>(
        `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso-v2-gtin-espaces/records` +
          `?limit=12&order_by=date_publication%20desc`,
      ),
    );

    return (data.results ?? []).map((r, i): Incident => {
      const date = r.date_publication ?? new Date().toISOString();
      return {
        id: `rappelconso:${date}:${i}`,
        moduleSlug: "health",
        title: r.libelle ?? "Rappel de produit",
        description: r.motif_rappel ?? r.risques_encourus,
        severity: recallSeverity(r),
        // Placement national (zone textuelle) — traité en bandeau, hors carte.
        lat: FRANCE_CENTER.lat,
        lng: FRANCE_CENTER.lng,
        national: true,
        startedAt: date,
        sourceId: this.id,
        sourceLabel: this.label,
        url: r.lien_vers_la_fiche_rappel,
        props: {
          marque: r.marque_produit,
          categorie: r.categorie_produit,
          sousCategorie: r.sous_categorie_produit,
          risques: r.risques_encourus,
          zone: r.zone_geographique_de_vente,
        },
      };
    });
  },
};
