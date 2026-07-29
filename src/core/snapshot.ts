// Instantané persistant des données amont nationales — point de rendez-vous entre les deux
// exécutions du projet (cf. ARCHITECTURE.md § « Deux exécutions »).
//
//   worker (`npm run ingest`, lancé par cron)  ──écrit──▶  table Snapshot  ──lit──▶  web
//
// Pourquoi persister plutôt que garder le cache mémoire : les deux exécutions sont deux
// **process distincts**, et sur l'hébergement cible (Passenger) le process web est recyclé
// dès que le trafic faiblit. Un cache mémoire n'est donc ni partagé ni durable.
//
// Ce module ne remplace PAS `cached()` : il s'appuie dessus comme cache de niveau 1. Une
// charge utile nationale peut peser plusieurs Mo (périmètres EFFIS, contours départementaux) ;
// la relire et la désérialiser à chaque requête coûterait plus cher que l'appel réseau évité.

import { cached } from "./cache";
import { prisma } from "../lib/db";

/**
 * Version de forme des charges utiles. **À incrémenter dès qu'on change la structure de ce
 * qu'une source met en instantané.**
 *
 * Le cache mémoire se vidait au redémarrage, ce qui pardonnait les refactors (un `TypeError`
 * après changement de forme, déjà vécu — cf. ARCHITECTURE.md). Un instantané persistant, lui,
 * survit au déploiement : sans cette version, le nouveau code désérialiserait l'ancienne forme
 * indéfiniment. Changer la version rend les anciennes entrées inatteignables (elles expirent
 * et sont purgées).
 */
const SCHEMA_VERSION = "v1";

/** Durée de mémorisation en RAM devant la base. Bornée par le TTL de la source. */
const L1_MAX_SECONDS = 60;

/** Le worker est le seul rôle autorisé à appeler les APIs amont pour ces données. */
function isWorker(): boolean {
  return process.env.FA_ROLE === "worker";
}

/**
 * `--force` du worker : réingérer sans attendre la péremption. Utile au premier déploiement
 * (remplir l'instantané tout de suite) et après un changement de `SCHEMA_VERSION`.
 * Sans effet côté web — le web ne produit jamais quand un worker est déclaré.
 */
function isForced(): boolean {
  return isWorker() && process.env.FA_FORCE === "1";
}

/**
 * `FA_INGEST=1` déclare qu'un worker alimente l'instantané (prod avec cron configuré).
 * Le web cesse alors d'interroger les APIs amont lui-même : il sert l'instantané, et si
 * celui-ci manque il **échoue franchement** plutôt que de fabriquer un silence trompeur —
 * le registre pose `ok: false` et l'UI dit que la source est indisponible (principe n°3).
 *
 * Absent (dev, ou prod avant que le cron soit en place) : le web se rabat sur l'appel direct,
 * exactement comme avant ce chantier. L'app fonctionne donc sans worker, en plus lent.
 */
function ingestDelegated(): boolean {
  return process.env.FA_INGEST === "1";
}

interface Stored<T> {
  value: T;
  fetchedAt: Date;
  ageSeconds: number;
}

/** Lit une entrée. `null` si absente. Lève si la base est inaccessible. */
async function read<T>(key: string): Promise<Stored<T> | null> {
  const row = await prisma.snapshot.findUnique({ where: { key } });
  if (!row) return null;
  return {
    value: JSON.parse(row.value) as T,
    fetchedAt: row.fetchedAt,
    ageSeconds: (Date.now() - row.fetchedAt.getTime()) / 1000,
  };
}

async function write<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const json = JSON.stringify(value);
  await prisma.snapshot.upsert({
    where: { key },
    create: { key, value: json, ttl: ttlSeconds, bytes: json.length },
    update: {
      value: json,
      ttl: ttlSeconds,
      bytes: json.length,
      fetchedAt: new Date(),
    },
  });
}

/**
 * Récupère une donnée amont **nationale** depuis l'instantané, ou la produit.
 *
 * S'utilise exactement comme `cached()` — mêmes clé/TTL/producteur — mais la donnée survit au
 * process. À réserver aux producteurs dont la clé **ne dépend pas de la zone demandée** :
 * c'est ce qui rend l'entrée mutualisable entre tous les utilisateurs et ingérable d'avance.
 * Une donnée propre à un point (qualité de l'air, POIs Overpass) reste sur `cached()`.
 */
export async function snapshot<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>,
): Promise<T> {
  const full = `${SCHEMA_VERSION}:${key}`;
  const l1 = Math.min(ttlSeconds, L1_MAX_SECONDS);

  return cached(`snap:${full}`, l1, async () => {
    const delegated = ingestDelegated();
    const worker = isWorker();

    let stored: Stored<T> | null = null;
    try {
      stored = await read<T>(full);
    } catch (err) {
      // L'instantané est une optimisation ; sa panne ne doit pas masquer une source vivante.
      // Mais si le web n'a pas le droit d'appeler l'amont, il n'y a pas de repli possible.
      console.error(`[snapshot] lecture impossible (${full})`, err);
      if (delegated && !worker) throw err;
    }

    if (stored && stored.ageSeconds < ttlSeconds && !isForced()) return stored.value;

    // Périmé ou absent.
    if (!worker && delegated) {
      // Un worker est censé alimenter cette clé. On sert le périmé plutôt que rien : une
      // donnée un peu ancienne, datée honnêtement, vaut mieux qu'un trou (la fraîcheur réelle
      // est reportée par `SourceRun` / `meta`). En revanche, rien du tout = échec franc.
      if (stored) return stored.value;
      throw new Error(
        `Instantané absent pour « ${key} » — le worker d'ingestion ne l'a pas encore produit.`,
      );
    }

    const value = await producer();
    try {
      await write(full, value, ttlSeconds);
    } catch (err) {
      // Écriture ratée = on a quand même la donnée fraîche à servir.
      console.error(`[snapshot] écriture impossible (${full})`, err);
    }
    return value;
  });
}

/** Âge (secondes) d'une entrée, sans la désérialiser. `null` si absente. */
export async function snapshotAge(key: string): Promise<number | null> {
  const row = await prisma.snapshot.findUnique({
    where: { key: `${SCHEMA_VERSION}:${key}` },
    select: { fetchedAt: true },
  });
  if (!row) return null;
  return (Date.now() - row.fetchedAt.getTime()) / 1000;
}

/** Supprime les entrées périmées depuis longtemps (hygiène, appelée par le worker). */
export async function purgeSnapshots(maxAgeSeconds = 7 * 24 * 3600): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeSeconds * 1000);
  const { count } = await prisma.snapshot.deleteMany({
    where: { fetchedAt: { lt: cutoff } },
  });
  return count;
}

// ─────────────────────────────── état d'ingestion ────────────────────────────────

export interface RunRecord {
  id: string;
  kind: "incident" | "poi";
  ok: boolean;
  count: number;
  stale: boolean;
  error?: string;
  ms: number;
}

/** Consigne le résultat d'une ingestion (worker). Ne lève jamais. */
export async function recordRun(run: RunRecord): Promise<void> {
  try {
    const data = {
      kind: run.kind,
      ok: run.ok,
      count: run.count,
      stale: run.stale,
      error: run.error?.slice(0, 500) ?? null,
      ms: run.ms,
      ranAt: new Date(),
    };
    await prisma.sourceRun.upsert({
      where: { id: run.id },
      create: { id: run.id, ...data },
      update: data,
    });
  } catch (err) {
    console.error(`[snapshot] consignation impossible (${run.id})`, err);
  }
}

/** Dernière ingestion connue de chaque source, indexée par id. Fail-soft : `{}` si panne. */
export async function lastRuns(): Promise<Record<string, { ranAt: string; ok: boolean }>> {
  try {
    const rows = await prisma.sourceRun.findMany({
      select: { id: true, ranAt: true, ok: true },
    });
    return Object.fromEntries(
      rows.map((r) => [r.id, { ranAt: r.ranAt.toISOString(), ok: r.ok }]),
    );
  } catch (err) {
    console.error("[snapshot] lecture des ingestions impossible", err);
    return {};
  }
}

/**
 * Active le journal WAL de SQLite : indispensable ici puisque **deux process** touchent le
 * même fichier (le worker écrit pendant que le web lit). Sans WAL, l'écriture verrouille
 * toute la base et les requêtes web échouent le temps d'une ingestion.
 * Le réglage est persistant (stocké dans le fichier) — l'appeler une fois suffit.
 */
export async function ensureWal(): Promise<string | null> {
  // ⚠️ `$queryRawUnsafe` et non `$executeRawUnsafe` : `PRAGMA journal_mode` et
  // `PRAGMA busy_timeout` RENVOIENT une ligne, et Prisma rejette un `execute` qui produit un
  // résultat (« Execute returned results, which is not allowed in SQLite »). Vérifié en
  // direct : avec `execute`, les trois PRAGMA échouaient et le WAL n'était jamais activé —
  // en silence, puisque l'échec était capté ici.
  const pragma = async (sql: string): Promise<unknown> => {
    try {
      return await prisma.$queryRawUnsafe(sql);
    } catch (err) {
      console.error(`[snapshot] ${sql} impossible`, err);
      return null;
    }
  };

  // Journal WAL : indispensable, deux process touchent le même fichier (le worker écrit
  // pendant que le web lit). Réglage persistant, stocké dans le fichier de base.
  const mode = (await pragma("PRAGMA journal_mode=WAL;")) as
    | { journal_mode?: string }[]
    | null;
  // Compromis durabilité/vitesse recommandé avec WAL.
  await pragma("PRAGMA synchronous=NORMAL;");
  // Attendre au lieu d'échouer si l'autre process tient le verrou (5 s).
  await pragma("PRAGMA busy_timeout=5000;");

  const applied = mode?.[0]?.journal_mode ?? null;
  if (applied && applied.toLowerCase() !== "wal") {
    console.warn(
      `[snapshot] journal SQLite = « ${applied} » et non WAL : les lectures web seront ` +
        `bloquées pendant les écritures du worker.`,
    );
  }
  return applied;
}
