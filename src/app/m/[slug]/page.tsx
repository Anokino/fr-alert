"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Info, Lightbulb, BookOpen, Plus, Loader2 } from "lucide-react";
import { distanceKm } from "@/core/geo";
import { fetchModule, fetchPois } from "@/lib/api-client";
import { readNumParam, readStrParam, writeParams } from "@/lib/url";
import { useLocation } from "@/context/LocationContext";
import type { ContextPanel, Incident, ModuleMeta, Poi } from "@/core/types";
import { Icon } from "@/components/Icon";
import { IncidentCard } from "@/components/IncidentCard";
import { RadiusSelector, zoomForRadius } from "@/components/RadiusSelector";
import { LocationBar } from "@/components/LocationBar";
import { cn } from "@/lib/utils";

const MapView = dynamic(
  () => import("@/components/map/MapView").then((m) => m.MapView),
  { ssr: false, loading: () => <div className="size-full animate-pulse bg-surface-2" /> },
);

const PANEL_ICON = { advice: Lightbulb, info: Info, definition: BookOpen } as const;

export default function ModulePage() {
  const slug = String(useParams().slug);
  // Point d'observation partagé par toute l'app (mode, point, rayon, zone) — cf. layout.
  const { point, bbox, national, mode, radius, place, setRadius, onMode, onPoint } =
    useLocation();
  const [data, setData] = useState<{ module: ModuleMeta; incidents: Incident[] } | null>(null);
  const [activeLayers, setActiveLayers] = useState<string[]>([]);
  const [pois, setPois] = useState<Poi[]>([]);
  const [poisLoading, setPoisLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  // Fenêtre temporelle des périmètres de feux (couche effis-burnt), réglable — local au module.
  const [burntDays, setBurntDays] = useState(3);

  // Au montage : rejouer l'état LOCAL au module depuis l'URL (couches, fenêtre). Le point et
  // le rayon sont gérés globalement par le LocationProvider.
  useEffect(() => {
    const layers = readStrParam("layers");
    const days = readNumParam("days");
    if (layers) setActiveLayers(layers.split(",").filter(Boolean));
    if (days !== undefined) setBurntDays(days);
  }, []);

  useEffect(() => {
    if (!bbox) return;
    let cancelled = false;
    setLoading(true);
    fetchModule(slug, bbox)
      .then((r) => !cancelled && setData({ module: r.module, incidents: r.incidents }))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug, bbox]);

  const burntActive = activeLayers.includes("effis-burnt");

  // Charge les POIs des couches actives.
  useEffect(() => {
    if (!bbox || activeLayers.length === 0) {
      setPois([]);
      setPoisLoading(false);
      return;
    }
    let cancelled = false;
    setPoisLoading(true);
    // La fenêtre `days` n'a d'effet que si la couche périmètres est active.
    const extra = burntActive ? { days: burntDays } : undefined;
    fetchPois(slug, bbox, activeLayers, extra)
      .then((p) => !cancelled && setPois(p))
      .finally(() => !cancelled && setPoisLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug, bbox, activeLayers, burntActive, burntDays]);

  // Refléter l'état LOCAL (couches, fenêtre) dans l'URL. Le point/rayon global est écrit par
  // le LocationProvider — `writeParams` fusionne, pas de conflit.
  useEffect(() => {
    writeParams({
      layers: activeLayers.join(",") || null,
      days: burntActive ? burntDays : null,
    });
  }, [activeLayers, burntActive, burntDays]);

  function toggleLayer(id: string) {
    setActiveLayers((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  const mod = data?.module;
  const incidents = data?.incidents ?? [];
  // Même règle que la home : « à proximité » = en cours et localisé. Les risques prévus
  // sont listés à part et n'apparaissent pas sur la carte (ils n'ont pas encore de lieu).
  const local = incidents.filter((i) => !i.national && !i.forecast);
  const nationalIncidents = incidents.filter((i) => i.national);
  const forecast = incidents.filter((i) => i.forecast && !i.national);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft size={15} aria-hidden /> Accueil
      </Link>

      {/* En-tête module */}
      <header className="mt-4 flex items-start gap-4">
        <span
          className="grid size-14 shrink-0 place-items-center rounded-xl"
          style={{
            background: mod ? `color-mix(in oklch, ${mod.accent} 16%, transparent)` : "var(--muted)",
            color: mod?.accent,
          }}
        >
          <Icon name={mod?.icon ?? "map-pin"} size={26} />
        </span>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {mod?.name ?? "Chargement…"}
          </h1>
          <p className="text-sm text-muted-foreground">{mod?.tagline}</p>
        </div>
        <Link
          href={`/signaler?module=${slug}`}
          className="hidden items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium transition hover:bg-surface-2 sm:inline-flex"
        >
          <Plus size={15} aria-hidden /> Signaler
        </Link>
      </header>

      {/* Point d'observation + rayon */}
      <LocationBar
        mode={mode}
        onMode={onMode}
        onPoint={onPoint}
        currentLabel={place}
        className="mt-5 items-start"
      />
      {!national && (
        <div className="mt-3">
          <RadiusSelector value={radius} onChange={setRadius} busy={loading} />
        </div>
      )}

      {/* Couches POI */}
      {mod && mod.poiLayers.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Afficher :
          </span>
          {mod.poiLayers.map((l) => {
            const on = activeLayers.includes(l.id);
            return (
              <button
                key={l.id}
                onClick={() => toggleLayer(l.id)}
                aria-pressed={on}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  on
                    ? "border-transparent text-primary-foreground"
                    : "border-border bg-surface text-muted-foreground hover:text-foreground",
                )}
                style={on ? { background: "var(--primary)" } : undefined}
              >
                {on && poisLoading ? (
                  <Loader2 size={13} className="animate-spin" aria-hidden />
                ) : (
                  <Icon name={l.icon} size={13} />
                )}{" "}
                {l.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Fenêtre temporelle des zones brûlées — visible quand la couche est active. */}
      {burntActive && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Zones brûlées sur :
          </span>
          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
            {[3, 7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setBurntDays(d)}
                aria-pressed={burntDays === d}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition",
                  burntDays === d
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {poisLoading && burntDays === d && (
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                )}
                {d} j
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Carte */}
      <section className="mt-5 overflow-hidden rounded-2xl border border-border">
        <div className="h-[360px] w-full sm:h-[420px]">
          {point && (
            <MapView
              center={point}
              zoom={national ? 5 : zoomForRadius(radius)}
              incidents={local}
              pois={pois}
              poiLayers={mod?.poiLayers}
              className="size-full"
            />
          )}
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        {/* Incidents */}
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">
            {local.length > 0
              ? `${local.length} incident${local.length > 1 ? "s" : ""} à proximité`
              : "Situation locale"}
          </h2>
          {local.length === 0 && nationalIncidents.length === 0 && forecast.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface/50 px-5 py-10 text-center text-sm text-muted-foreground">
              {loading ? "Chargement…" : "Aucun incident actif dans votre secteur."}
            </div>
          ) : (
            <div className="grid gap-2.5">
              {local.map((inc) => (
                <IncidentCard
                  key={inc.id}
                  incident={inc}
                  accent={mod?.accent}
                  moduleIcon={mod?.icon}
                  distanceKm={
                    point ? distanceKm(point, { lat: inc.lat, lng: inc.lng }) : undefined
                  }
                />
              ))}
              {nationalIncidents.map((inc) => (
                <IncidentCard
                  key={inc.id}
                  incident={inc}
                  accent={mod?.accent}
                  moduleIcon={mod?.icon}
                />
              ))}
            </div>
          )}

          {forecast.length > 0 && (
            <>
              <h3 className="mb-1 mt-8 font-display text-base font-semibold">
                Risques prévus
              </h3>
              <p className="mb-3 text-sm text-muted-foreground">
                Niveaux annoncés, pas des incidents en cours.
              </p>
              <div className="grid gap-2.5">
                {forecast.map((inc) => (
                  <IncidentCard
                    key={inc.id}
                    incident={inc}
                    accent={mod?.accent}
                    moduleIcon={mod?.icon}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* Contexte + sources */}
        <aside className="space-y-4">
          {mod?.contextPanels?.map((p: ContextPanel) => {
            const PIcon = PANEL_ICON[p.kind ?? "info"];
            return (
              <div
                key={p.id}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <PIcon size={15} className="text-primary" aria-hidden />
                  {p.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {p.body}
                </p>
              </div>
            );
          })}

          {mod && (
            <div className="rounded-xl border border-border bg-surface/50 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sources actives
              </h3>
              {mod.activeSources.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {mod.activeSources.map((s) => (
                    <li key={s.id} className="text-xs text-muted-foreground">
                      <span className="text-foreground">{s.label}</span> —{" "}
                      {s.attribution}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Aucune source active (clé requise). Voir la configuration.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
