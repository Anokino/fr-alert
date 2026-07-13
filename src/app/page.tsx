"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { LocateFixed, RefreshCw, AlertTriangle } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { bboxAround, distanceKm } from "@/core/geo";
import { maxSeverity } from "@/core/severity";
import { fetchIncidents, fetchModules } from "@/lib/api-client";
import type { Incident, ModuleMeta, Severity } from "@/core/types";
import { StatusBeacon } from "@/components/StatusBeacon";
import { ModuleGrid, type ModuleSummary } from "@/components/ModuleGrid";
import { IncidentCard } from "@/components/IncidentCard";
import { cn } from "@/lib/utils";

const MapView = dynamic(
  () => import("@/components/map/MapView").then((m) => m.MapView),
  { ssr: false, loading: () => <div className="size-full animate-pulse bg-surface-2" /> },
);

const RADII = [10, 25, 50];

export default function HomePage() {
  const { position, status, usingFallback, request } = useGeolocation(true);
  const [radius, setRadius] = useState(25);
  const [modules, setModules] = useState<ModuleMeta[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [place, setPlace] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bbox = useMemo(
    () => (position ? bboxAround(position, radius) : null),
    [position, radius],
  );

  // Charge les métadonnées de modules une fois.
  useEffect(() => {
    fetchModules().then(setModules).catch(() => {});
  }, []);

  // Charge les incidents à chaque changement de zone.
  useEffect(() => {
    if (!bbox || !position) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchIncidents(bbox)
      .then((r) => {
        if (!cancelled) setIncidents(r.incidents);
      })
      .catch(() => !cancelled && setError("Impossible de charger les incidents."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [bbox, position]);

  // Nom de commune pour le libellé du beacon.
  useEffect(() => {
    if (!position || usingFallback) {
      setPlace(usingFallback ? "France (position approximative)" : undefined);
      return;
    }
    fetch(`/api/geo/reverse?lat=${position.lat}&lng=${position.lng}`)
      .then((r) => r.json())
      .then((d) => setPlace(d.commune?.nom))
      .catch(() => {});
  }, [position, usingFallback]);

  const moduleBySlug = useMemo(
    () => Object.fromEntries(modules.map((m) => [m.slug, m])),
    [modules],
  );

  const local = incidents.filter((i) => !i.national);
  const national = incidents.filter((i) => i.national);

  const summaries = useMemo<Record<string, ModuleSummary>>(() => {
    const acc: Record<string, ModuleSummary> = {};
    for (const inc of incidents) {
      const cur = acc[inc.moduleSlug] ?? { count: 0, maxSeverity: "green" as Severity };
      cur.count += 1;
      cur.maxSeverity = maxSeverity([cur.maxSeverity, inc.severity]);
      acc[inc.moduleSlug] = cur;
    }
    return acc;
  }, [incidents]);

  const overall = maxSeverity(local.map((i) => i.severity));

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      {/* Beacon — signature */}
      <section className="flex flex-col items-center pt-4">
        <StatusBeacon
          severity={overall}
          count={local.length}
          place={place}
          loading={loading && incidents.length === 0}
        />

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
            {RADII.map((r) => (
              <button
                key={r}
                onClick={() => setRadius(r)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  radius === r
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r} km
              </button>
            ))}
          </div>
          <button
            onClick={request}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            {status === "locating" ? (
              <RefreshCw size={15} className="animate-spin" aria-hidden />
            ) : (
              <LocateFixed size={15} aria-hidden />
            )}
            {usingFallback ? "Activer ma position" : "Actualiser"}
          </button>
        </div>

        {usingFallback && (
          <p className="mt-3 max-w-md text-center text-xs text-muted-foreground">
            Position non partagée : affichage à l'échelle nationale. Autorisez la
            géolocalisation pour voir les dangers autour de vous.
          </p>
        )}
        {error && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-sev-orange">
            <AlertTriangle size={15} aria-hidden /> {error}
          </p>
        )}
      </section>

      {/* Carte */}
      <section className="mt-8 overflow-hidden rounded-2xl border border-border">
        <div className="h-[380px] w-full sm:h-[440px]">
          {position && (
            <MapView
              center={position}
              zoom={radius <= 10 ? 11 : radius <= 25 ? 10 : 9}
              incidents={local}
              className="size-full"
            />
          )}
        </div>
      </section>

      {/* Modules */}
      <section className="mt-10">
        <h2 className="mb-3 font-display text-lg font-semibold">
          Explorer par type
        </h2>
        <ModuleGrid modules={modules} summaries={summaries} />
      </section>

      {/* Bandeau national (rappels) */}
      {national.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
            Alertes nationales
            <span className="text-sm font-normal text-muted-foreground">
              {national.length}
            </span>
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {national.slice(0, 6).map((inc) => (
              <IncidentCard
                key={inc.id}
                incident={inc}
                moduleName={moduleBySlug[inc.moduleSlug]?.name}
                moduleIcon={moduleBySlug[inc.moduleSlug]?.icon}
                accent={moduleBySlug[inc.moduleSlug]?.accent}
              />
            ))}
          </div>
        </section>
      )}

      {/* Liste locale */}
      <section className="mt-10">
        <h2 className="mb-3 font-display text-lg font-semibold">
          {local.length > 0 ? "Incidents à proximité" : "Autour de vous"}
        </h2>
        {local.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface/50 px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {loading
                ? "Analyse des sources en cours…"
                : "Aucun incident détecté dans ce rayon. Élargissez la zone ou signalez un événement."}
            </p>
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {local.map((inc) => (
              <IncidentCard
                key={inc.id}
                incident={inc}
                moduleName={moduleBySlug[inc.moduleSlug]?.name}
                moduleIcon={moduleBySlug[inc.moduleSlug]?.icon}
                accent={moduleBySlug[inc.moduleSlug]?.accent}
                distanceKm={
                  position
                    ? distanceKm(position, { lat: inc.lat, lng: inc.lng })
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
