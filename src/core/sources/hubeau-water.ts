import { cached, fetchJson } from "../cache";
import { bboxCenter } from "../geo";
import { reverseCommune } from "../geocode";
import type { Incident, IncidentSource, Severity } from "../types";

interface DisResult {
  code_commune?: string;
  nom_commune?: string;
  nom_uge?: string;
  date_prelevement?: string;
  conclusion_conformite_prelevement?: string;
  conformite_limites_bact_prelevement?: string;
  conformite_limites_pc_prelevement?: string;
}
interface DisResponse {
  data: DisResult[];
}

/** Une conclusion textuelle → gravité. Non conforme = orange (rouge si bactério). */
function conformitySeverity(r: DisResult): Severity {
  const bactNC = r.conformite_limites_bact_prelevement === "N";
  const pcNC = r.conformite_limites_pc_prelevement === "N";
  const text = (r.conclusion_conformite_prelevement ?? "").toLowerCase();
  const conforme = text.includes("conforme") && !text.includes("non conforme");
  if (bactNC) return "red";
  if (pcNC || !conforme) return "orange";
  return "green";
}

export const hubeauWaterSource: IncidentSource = {
  id: "hubeau-water",
  label: "Hub'Eau — Qualité de l'eau potable",
  attribution: "Hub'Eau · Ministère de la Santé (ARS)",
  ttlSeconds: 6 * 3600,

  async fetch(ctx): Promise<Incident[]> {
    const c = ctx.center ?? bboxCenter(ctx.bbox);
    const commune = await reverseCommune(c);
    if (!commune) return [];

    const key = `hubeau-water:${commune.code}`;
    const data = await cached(key, this.ttlSeconds, () =>
      fetchJson<DisResponse>(
        `https://hubeau.eaufrance.fr/api/v1/qualite_eau_potable/resultats_dis` +
          `?code_commune=${commune.code}&size=20&sort=desc`,
      ),
    );

    const results = data.data ?? [];
    if (results.length === 0) return [];

    // Dernier prélèvement le plus récent.
    const latest = results[0];
    const severity = conformitySeverity(latest);
    if (severity === "green") return [];

    const centre = commune.centre?.coordinates;
    const lat = centre ? centre[1] : c.lat;
    const lng = centre ? centre[0] : c.lng;

    return [
      {
        id: `hubeau-water:${commune.code}:${latest.date_prelevement ?? "na"}`,
        moduleSlug: "water",
        title: `Eau du robinet non conforme — ${commune.nom}`,
        description:
          latest.conclusion_conformite_prelevement ??
          "Dernier contrôle sanitaire non conforme.",
        severity,
        lat,
        lng,
        startedAt: latest.date_prelevement ?? new Date().toISOString(),
        sourceId: this.id,
        sourceLabel: this.label,
        props: {
          commune: commune.nom,
          reseau: latest.nom_uge,
          bacterio: latest.conformite_limites_bact_prelevement,
          physicochimie: latest.conformite_limites_pc_prelevement,
        },
      },
    ];
  },
};
