import { airModule } from "./modules/air";
import { fireModule } from "./modules/fire";
import { floodModule } from "./modules/flood";
import { healthModule } from "./modules/health";
import { quakeModule } from "./modules/quake";
import { waterModule } from "./modules/water";
import { weatherModule } from "./modules/weather";
import type {
  FetchContext,
  Incident,
  IncidentModule,
  IncidentSource,
  ModuleMeta,
  Poi,
  SourceStatus,
} from "./types";

/** Registre : ajouter un module = l'ajouter ici. Rien d'autre à toucher. */
export const modules: IncidentModule[] = [
  fireModule,
  floodModule,
  waterModule,
  airModule,
  quakeModule,
  weatherModule,
  healthModule,
];

export function getModule(slug: string): IncidentModule | undefined {
  return modules.find((m) => m.slug === slug);
}

/** Une source est active si elle ne requiert pas de clé, ou si la clé est présente. */
export function isSourceActive(source: IncidentSource): boolean {
  if (!source.requiresEnv) return true;
  return Boolean(process.env[source.requiresEnv]);
}

/** Métadonnées sérialisables d'un module (pour le client). */
export function moduleMeta(m: IncidentModule): ModuleMeta {
  return {
    slug: m.slug,
    name: m.name,
    tagline: m.tagline,
    icon: m.icon,
    accent: m.accent,
    poiLayers: m.poiLayers.map((l) => ({
      id: l.id,
      label: l.label,
      icon: l.icon,
      color: l.color,
    })),
    contextPanels: m.contextPanels ?? [],
    activeSources: m.sources
      .filter(isSourceActive)
      .map((s) => ({ id: s.id, label: s.label, attribution: s.attribution })),
  };
}

async function runSource(
  source: IncidentSource,
  ctx: FetchContext,
): Promise<{ status: SourceStatus; incidents: Incident[] }> {
  if (!isSourceActive(source)) {
    return {
      status: { id: source.id, label: source.label, ok: true, count: 0 },
      incidents: [],
    };
  }
  try {
    const incidents = await source.fetch(ctx);
    return {
      status: {
        id: source.id,
        label: source.label,
        ok: true,
        count: incidents.length,
      },
      incidents,
    };
  } catch (err) {
    console.error(`[source ${source.id}]`, err);
    return {
      status: { id: source.id, label: source.label, ok: false, count: 0 },
      incidents: [],
    };
  }
}

/** Agrège les incidents de tous les modules demandés (fail-soft, en parallèle). */
export async function collectIncidents(
  ctx: FetchContext,
  moduleSlugs?: string[],
): Promise<{ incidents: Incident[]; sources: SourceStatus[] }> {
  const targets = moduleSlugs?.length
    ? modules.filter((m) => moduleSlugs.includes(m.slug))
    : modules;

  const sources = targets.flatMap((m) => m.sources);
  const results = await Promise.all(sources.map((s) => runSource(s, ctx)));

  const incidents = results.flatMap((r) => r.incidents);
  const statuses = results.map((r) => r.status);
  return { incidents, sources: statuses };
}

/** Récupère les POIs d'un module (couches optionnellement filtrées). */
export async function collectPois(
  ctx: FetchContext,
  moduleSlug: string,
  layerIds?: string[],
): Promise<{ pois: Poi[]; sources: SourceStatus[] }> {
  const m = getModule(moduleSlug);
  if (!m) return { pois: [], sources: [] };

  const layers = layerIds?.length
    ? m.poiLayers.filter((l) => layerIds.includes(l.id))
    : m.poiLayers;

  const results = await Promise.all(
    layers.map(async (layer) => {
      try {
        const pois = await layer.source.fetch(ctx);
        return {
          pois,
          status: {
            id: layer.id,
            label: layer.label,
            ok: true,
            count: pois.length,
          } as SourceStatus,
        };
      } catch (err) {
        console.error(`[poi ${layer.id}]`, err);
        return {
          pois: [] as Poi[],
          status: {
            id: layer.id,
            label: layer.label,
            ok: false,
            count: 0,
          } as SourceStatus,
        };
      }
    }),
  );

  return {
    pois: results.flatMap((r) => r.pois),
    sources: results.map((r) => r.status),
  };
}
