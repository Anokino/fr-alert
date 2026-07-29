// Import relatif (et non l'alias `@/`) : `core/` doit rester compilable par `tsc` seul pour
// le worker d'ingestion, qui tourne hors du bundler Next (cf. tsconfig.worker.json).
import { prisma } from "../../lib/db";
import { pointInBBox } from "../geo";
import type { Incident, IncidentSource, Severity } from "../types";

const MAX_AGE_HOURS = 48;

/**
 * Signalements citoyens (SQLite) projetés en Incident[] pour un module donné.
 * Une instance par module ; chaque module rattache la sienne.
 */
export function makeCitizenSource(moduleSlug: string): IncidentSource {
  return {
    id: `citizen-${moduleSlug}`,
    label: "Signalements citoyens",
    attribution: "Contributions France Alert",
    ttlSeconds: 0, // pas de cache : les signalements doivent apparaître immédiatement

    async fetch(ctx): Promise<Incident[]> {
      const since = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000);
      // Pas de try/catch ici : le fail-soft appartient à `runSource` (registry.ts), qui
      // logge et marque `meta.sources[].ok=false`. Avaler l'erreur ici renverrait [] en
      // annonçant un succès — l'UI dirait « aucun signalement » base éteinte.
      const reports = await prisma.report.findMany({
        where: {
          moduleSlug,
          status: { not: "rejected" },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      });

      return reports
        .filter((r) => pointInBBox({ lat: r.lat, lng: r.lng }, ctx.bbox))
        .map(
          (r): Incident => ({
            id: `citizen:${r.id}`,
            moduleSlug: r.moduleSlug,
            title: r.title,
            description: r.description ?? undefined,
            severity: r.severity as Severity,
            lat: r.lat,
            lng: r.lng,
            startedAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
            sourceId: this.id,
            sourceLabel: this.label,
            props: {
              citizen: true,
              status: r.status,
              confirmations: r.confirmations,
            },
          }),
        );
    },
  };
}
