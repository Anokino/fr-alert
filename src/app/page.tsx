"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { distanceKm } from "@/core/geo";
import { maxSeverity } from "@/core/severity";
import { fetchIncidents, fetchModules } from "@/lib/api-client";
import { useLocation } from "@/context/LocationContext";
import type { Incident, ModuleMeta, Severity } from "@/core/types";
import { StatusBeacon } from "@/components/StatusBeacon";
import { ModuleGrid, type ModuleSummary } from "@/components/ModuleGrid";
import { IncidentCard } from "@/components/IncidentCard";
import { RadiusSelector, zoomForRadius } from "@/components/RadiusSelector";
import { PendingButton } from "@/components/PendingButton";
import { LocationBar } from "@/components/LocationBar";

const MapView = dynamic(
  () => import("@/components/map/MapView").then((m) => m.MapView),
  { ssr: false, loading: () => <div className="size-full animate-pulse bg-surface-2" /> },
);

export default function HomePage() {
  // Point d'observation partagé par toute l'app (mode, point, rayon, zone) — cf. layout.
  const {
    point,
    bbox,
    national,
    mode,
    radius,
    place,
    status,
    atFallback,
    reloadKey,
    setRadius,
    onMode,
    onPoint,
    refresh,
  } = useLocation();
  const [modules, setModules] = useState<ModuleMeta[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Charge les métadonnées de modules une fois.
  useEffect(() => {
    fetchModules().then(setModules).catch(() => {});
  }, []);

  // Charge les incidents à chaque changement de zone (ou rafraîchissement manuel).
  useEffect(() => {
    if (!bbox) return;
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
  }, [bbox, reloadKey]);

  const moduleBySlug = useMemo(
    () => Object.fromEntries(modules.map((m) => [m.slug, m])),
    [modules],
  );

  // Le beacon et le compteur répondent à « un danger MAINTENANT, ici ». En sont donc exclus
  // les alertes nationales (pas localisées) et les risques prévus (pas encore là).
  const local = incidents.filter((i) => !i.national && !i.forecast);
  const nationalIncidents = incidents.filter((i) => i.national);
  const forecast = incidents.filter((i) => i.forecast && !i.national);

  // Les pastilles de modules reflètent l'état courant, comme le beacon : un risque prévu ne
  // doit pas colorer une tuile en orange alors que le beacon est vert.
  const summaries = useMemo<Record<string, ModuleSummary>>(() => {
    const acc: Record<string, ModuleSummary> = {};
    for (const inc of incidents.filter((i) => !i.forecast)) {
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

        <LocationBar
          mode={mode}
          onMode={onMode}
          onPoint={onPoint}
          currentLabel={place}
          className="mt-6"
        />

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {!national && (
            <RadiusSelector value={radius} onChange={setRadius} busy={loading} />
          )}
          <PendingButton
            onClick={refresh}
            busy={status === "locating" || loading}
            icon={<RefreshCw size={15} aria-hidden />}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Actualiser
          </PendingButton>
        </div>

        {atFallback && (
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
          {point && (
            <MapView
              center={point}
              zoom={national ? 5 : zoomForRadius(radius)}
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
      {nationalIncidents.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
            Alertes nationales
            <span className="text-sm font-normal text-muted-foreground">
              {nationalIncidents.length}
            </span>
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {nationalIncidents.slice(0, 6).map((inc) => (
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
                  point
                    ? distanceKm(point, { lat: inc.lat, lng: inc.lng })
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Risques prévus — séparés du verdict « maintenant », jamais dans le beacon. */}
      {forecast.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
            Risques prévus
            <span className="text-sm font-normal text-muted-foreground">
              {forecast.length}
            </span>
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Niveaux de risque annoncés par les services officiels. Ce ne sont pas des
            incidents en cours : chaque carte précise son échéance.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {forecast.map((inc) => (
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
    </div>
  );
}
