/**
 * Worker d'ingestion — second point d'entrée du projet, à côté du web.
 *
 *   node dist/worker/ingest.js  [--force] [--only=<id,id>] [--quiet]
 *
 * Fait **une passe** puis se termine : il rafraîchit l'instantané de toutes les sources
 * déclarées `scope: "national"` dont l'entrée a dépassé son `ttlSeconds`, puis rend la main.
 * C'est cron qui le rappelle (cf. docs/DEPLOY.md).
 *
 * Pourquoi un script one-shot et pas un démon : sur l'hébergement cible (Passenger, mutualisé
 * o2switch), un process de fond n'est pas garanti de survivre — il est recyclé dès que le
 * trafic faiblit. L'hébergeur lui-même maintient son Redis en vie par un cron + `flock`.
 * Un script qui démarre, travaille et sort est donc la forme fiable ici — et elle reste
 * valable ailleurs (un simple scheduler suffit à le rappeler).
 *
 * ⚠️ Le worker ne connaît **aucune source en dur** : il itère le registre. Ajouter une source
 * ingérable = créer son fichier et déclarer `scope: "national"`. Rien à changer ici, ni dans
 * le cron : la cadence de chaque source est son propre `ttlSeconds`.
 */

// Doit être posé AVANT tout appel à `snapshot()` : c'est ce qui autorise ce process à
// interroger les APIs amont (le web, lui, se contente de lire l'instantané).
process.env.FA_ROLE = "worker";

import { modules, isSourceActive } from "../core/registry";
import { FRANCE_BBOX, FRANCE_CENTER } from "../core/geo";
import {
  ensureWal,
  purgeSnapshots,
  recordRun,
  type RunRecord,
} from "../core/snapshot";
import { prisma } from "../lib/db";
import type { FetchContext } from "../core/types";

interface Options {
  force: boolean;
  only: Set<string> | null;
  quiet: boolean;
}

function parseArgs(argv: string[]): Options {
  const only = argv
    .find((a) => a.startsWith("--only="))
    ?.slice("--only=".length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    force: argv.includes("--force"),
    only: only?.length ? new Set(only) : null,
    quiet: argv.includes("--quiet"),
  };
}

/** Contexte d'ingestion : la France entière — c'est la définition d'une source `national`. */
function franceContext(params?: Record<string, string>): FetchContext {
  return { bbox: FRANCE_BBOX, center: FRANCE_CENTER, params };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Suffixe lisible pour une couche paramétrée (ex. « effis-burnt[days=30] »). */
function labelFor(id: string, params?: Record<string, string>): string {
  if (!params || !Object.keys(params).length) return id;
  const kv = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${id}[${kv}]`;
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.force) process.env.FA_FORCE = "1";

  const startedAt = Date.now();
  const log = (msg: string) => {
    if (!opts.quiet) console.log(msg);
  };

  log(`[ingest] ${new Date().toISOString()} — début${opts.force ? " (--force)" : ""}`);

  // Deux process écrivent/lisent le même fichier SQLite : sans WAL, l'ingestion verrouille
  // la base et les requêtes web échouent pendant ce temps.
  const journal = await ensureWal();
  log(`[ingest] journal SQLite : ${journal ?? "inconnu"}`);

  const runs: RunRecord[] = [];

  /** Exécute une unité d'ingestion, la consigne, et ne laisse jamais remonter d'erreur. */
  async function ingest(
    id: string,
    kind: "incident" | "poi",
    params: Record<string, string> | undefined,
    run: () => Promise<{ count: number; stale?: boolean }>,
  ): Promise<void> {
    const name = labelFor(id, params);
    const t0 = Date.now();
    try {
      const { count, stale } = await run();
      const ms = Date.now() - t0;
      const record: RunRecord = { id: name, kind, ok: true, count, stale: stale ?? false, ms };
      runs.push(record);
      await recordRun(record);
      log(
        `  ✓ ${name.padEnd(34)} ${String(count).padStart(5)} ${kind === "incident" ? "incidents" : "éléments"}` +
          `  ${ms} ms${stale ? "  ⚠️ flux amont périmé" : ""}`,
      );
    } catch (err) {
      const ms = Date.now() - t0;
      const message = errorMessage(err);
      const record: RunRecord = { id: name, kind, ok: false, count: 0, stale: false, error: message, ms };
      runs.push(record);
      await recordRun(record);
      // Une source en échec ne fait pas échouer l'ingestion : les autres doivent aboutir.
      // L'échec est consigné (SourceRun) pour que l'app puisse dire la vérité sur la fraîcheur.
      console.error(`  ✗ ${name.padEnd(34)} ÉCHEC (${ms} ms) — ${message}`);
    }
  }

  for (const m of modules) {
    // ─── sources d'incidents ───
    for (const source of m.sources) {
      if (source.scope !== "national") continue; // `local` = à la demande, non ingérable
      if (!isSourceActive(source)) continue; // clé absente → source non proposée
      if (opts.only && !opts.only.has(source.id)) continue;

      await ingest(source.id, "incident", undefined, async () => {
        const incidents = await source.fetch(franceContext());
        let stale = false;
        try {
          stale = (await source.isStale?.(franceContext())) ?? false;
        } catch (err) {
          console.error(`  … contrôle de fraîcheur ${source.id}`, errorMessage(err));
        }
        return { count: incidents.length, stale };
      });
    }

    // ─── couches contextuelles ───
    for (const layer of m.poiLayers) {
      const src = layer.source;
      if (src.scope !== "national") continue;
      if (!isSourceActive(src)) continue;
      if (opts.only && !opts.only.has(layer.id)) continue;

      // Une couche paramétrable a une entrée d'instantané par jeu de paramètres.
      const variants = src.ingestParams?.length ? src.ingestParams : [undefined];
      for (const params of variants) {
        await ingest(layer.id, "poi", params, async () => {
          const pois = await src.fetch(franceContext(params));
          return { count: pois.length };
        });
      }
    }
  }

  const purged = await purgeSnapshots();
  if (purged) log(`[ingest] ${purged} instantané(s) hors d'âge purgé(s)`);

  const ok = runs.filter((r) => r.ok).length;
  const failed = runs.length - ok;
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  log(`[ingest] terminé en ${seconds}s — ${ok} ok, ${failed} en échec, ${runs.length} au total`);

  if (!runs.length) {
    console.warn(
      "[ingest] aucune source ingérable active. Clés d'API absentes, ou aucune source " +
        "ne déclare `scope: \"national\"` — vérifier l'environnement.",
    );
  }

  // Des échecs partiels sont normaux (une source amont tombe) et ne doivent pas déclencher
  // l'alerte mail du cron : ils sont consignés et l'app dégrade proprement. Seule une panne
  // totale (base inaccessible, cf. `catch` de l'appelant) rend un code d'erreur.
  return 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error("[ingest] échec fatal", err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
