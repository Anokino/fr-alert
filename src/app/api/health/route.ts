import { NextResponse } from "next/server";
import { modules, isSourceActive } from "@/core/registry";
import { lastRuns } from "@/core/snapshot";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — état de l'installation et de l'ingestion.
 *
 * Sert à vérifier un déploiement d'un seul appel : la base répond-elle, le worker
 * tourne-t-il, quelles sources sont ingérées et depuis quand. C'est aussi le garde-fou du
 * modèle « cron » : si le cron casse, l'app continue de servir l'instantané mais celui-ci
 * vieillit — cette route est l'endroit où ça se voit (principe produit n°3 : ne jamais
 * mentir sur la fraîcheur).
 */
export async function GET() {
  const delegated = process.env.FA_INGEST === "1";

  let dbOk = true;
  let snapshots = 0;
  try {
    snapshots = await prisma.snapshot.count();
  } catch {
    dbOk = false;
  }

  const runs = await lastRuns();

  // Sources attendues côté ingestion : celles qui se déclarent nationales et sont actives.
  const expected: { id: string; kind: "incident" | "poi" }[] = [];
  for (const m of modules) {
    for (const s of m.sources) {
      if (s.scope === "national" && isSourceActive(s)) {
        expected.push({ id: s.id, kind: "incident" });
      }
    }
    for (const l of m.poiLayers) {
      if (l.source.scope === "national" && isSourceActive(l.source)) {
        expected.push({ id: l.id, kind: "poi" });
      }
    }
  }

  const now = Date.now();
  // Une entrée de `SourceRun` peut être suffixée par ses paramètres (« effis-burnt[days=7] ») :
  // on rattache donc par préfixe pour retrouver la couche.
  const ingestion = expected.map((e) => {
    const key =
      Object.keys(runs).find((k) => k === e.id) ??
      Object.keys(runs).find((k) => k.startsWith(`${e.id}[`));
    const run = key ? runs[key] : undefined;
    return {
      id: e.id,
      kind: e.kind,
      ingested: Boolean(run),
      ok: run?.ok ?? null,
      ranAt: run?.ranAt ?? null,
      ageSeconds: run ? Math.round((now - Date.parse(run.ranAt)) / 1000) : null,
    };
  });

  const never = ingestion.filter((i) => !i.ingested).length;
  const lastRunAt = Object.values(runs)
    .map((r) => Date.parse(r.ranAt))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a)[0];

  return NextResponse.json({
    ok: dbOk,
    db: { ok: dbOk, snapshots },
    worker: {
      // `true` = le web fait confiance à l'instantané et n'appelle plus les APIs amont.
      delegated,
      lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
      lastRunAgeSeconds: lastRunAt ? Math.round((now - lastRunAt) / 1000) : null,
      neverIngested: never,
    },
    ingestion,
    env: {
      firmsKey: Boolean(process.env.FIRMS_MAP_KEY),
      meteofranceToken: Boolean(process.env.METEOFRANCE_TOKEN),
      nodeEnv: process.env.NODE_ENV ?? null,
    },
    generatedAt: new Date().toISOString(),
  });
}
