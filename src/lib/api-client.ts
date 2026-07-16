import type {
  BBox,
  Incident,
  IncidentsResponse,
  ModuleMeta,
  Poi,
  SourceStatus,
} from "@/core/types";

function bboxParam(bbox: BBox): string {
  return bbox.map((n) => n.toFixed(5)).join(",");
}

export async function fetchIncidents(
  bbox: BBox,
  moduleSlugs?: string[],
): Promise<IncidentsResponse> {
  const params = new URLSearchParams({ bbox: bboxParam(bbox) });
  if (moduleSlugs?.length) params.set("modules", moduleSlugs.join(","));
  const res = await fetch(`/api/incidents?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Chargement des incidents impossible");
  return res.json();
}

export async function fetchModules(): Promise<ModuleMeta[]> {
  const res = await fetch("/api/modules", { cache: "force-cache" });
  if (!res.ok) throw new Error("Chargement des modules impossible");
  return (await res.json()).modules;
}

export async function fetchModule(
  slug: string,
  bbox: BBox,
): Promise<{ module: ModuleMeta; incidents: Incident[]; meta: { sources: SourceStatus[] } }> {
  const res = await fetch(
    `/api/modules/${slug}?bbox=${bboxParam(bbox)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error("Module introuvable");
  return res.json();
}

export async function fetchPois(
  moduleSlug: string,
  bbox: BBox,
  layerIds?: string[],
  extra?: Record<string, string | number>,
): Promise<Poi[]> {
  const params = new URLSearchParams({
    module: moduleSlug,
    bbox: bboxParam(bbox),
  });
  if (layerIds?.length) params.set("layers", layerIds.join(","));
  // Paramètres de couche réglables (ex. { days: 3 } pour les périmètres de feux).
  for (const [k, v] of Object.entries(extra ?? {})) params.set(k, String(v));
  const res = await fetch(`/api/pois?${params}`, { cache: "no-store" });
  if (!res.ok) return [];
  return (await res.json()).pois;
}

export interface ReportInput {
  moduleSlug: string;
  title: string;
  description?: string;
  severity: "green" | "yellow" | "orange" | "red";
  lat: number;
  lng: number;
  contact?: string;
}

export async function createReport(
  input: ReportInput,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  return { ok: false, error: body.error ?? "Envoi impossible" };
}
