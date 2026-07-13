"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, MapPin, Send } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { fetchModules, createReport } from "@/lib/api-client";
import type { LatLng, ModuleMeta, Severity } from "@/core/types";
import { SEVERITY_SHORT } from "@/core/severity";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

const MapView = dynamic(
  () => import("@/components/map/MapView").then((m) => m.MapView),
  { ssr: false, loading: () => <div className="size-full animate-pulse bg-surface-2" /> },
);

const SEVERITIES: Severity[] = ["yellow", "orange", "red"];
const SEV_VAR: Record<Severity, string> = {
  green: "var(--sev-green)",
  yellow: "var(--sev-yellow)",
  orange: "var(--sev-orange)",
  red: "var(--sev-red)",
};

function SignalerForm() {
  const searchParams = useSearchParams();
  const { position } = useGeolocation(true);

  const [modules, setModules] = useState<ModuleMeta[]>([]);
  const [moduleSlug, setModuleSlug] = useState(searchParams.get("module") ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("orange");
  const [picked, setPicked] = useState<LatLng | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchModules().then((m) => {
      // Ne proposer que les modules acceptant des signalements citoyens.
      setModules(m);
      if (!moduleSlug && m.length) setModuleSlug(m[0].slug);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loc = picked ?? position;
  const canSubmit = moduleSlug && title.trim().length >= 3 && loc && !submitting;

  async function submit() {
    if (!loc || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    const res = await createReport({
      moduleSlug,
      title: title.trim(),
      description: description.trim() || undefined,
      severity,
      lat: loc.lat,
      lng: loc.lng,
    });
    setSubmitting(false);
    if (res.ok) setDone(true);
    else setError(res.error ?? "Envoi impossible");
  }

  const mapCenter = useMemo(() => loc, [loc]);

  if (done) {
    return (
      <div className="mx-auto max-w-md px-5 py-20 text-center">
        <CheckCircle2 size={56} className="mx-auto text-sev-green" aria-hidden />
        <h1 className="mt-4 font-display text-2xl font-bold">Signalement envoyé</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Merci. Votre signalement est visible sur la carte pendant 48 h et aide
          les personnes autour de vous.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Retour à l'accueil
          </Link>
          <button
            onClick={() => {
              setDone(false);
              setTitle("");
              setDescription("");
            }}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium"
          >
            Nouveau signalement
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft size={15} aria-hidden /> Accueil
      </Link>

      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">
        Signaler un incident
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Décrivez ce que vous observez. En cas d'urgence vitale, appelez d'abord le{" "}
        <span className="font-mono text-foreground">112</span>.
      </p>

      <div className="mt-6 space-y-6">
        {/* Type */}
        <div>
          <label className="mb-2 block text-sm font-medium">Type d'incident</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {modules.map((m) => (
              <button
                key={m.slug}
                type="button"
                onClick={() => setModuleSlug(m.slug)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition",
                  moduleSlug === m.slug
                    ? "border-primary bg-surface-2"
                    : "border-border bg-surface text-muted-foreground hover:text-foreground",
                )}
              >
                <span style={{ color: m.accent }}>
                  <Icon name={m.icon} size={20} />
                </span>
                {m.name}
              </button>
            ))}
          </div>
        </div>

        {/* Titre */}
        <div>
          <label htmlFor="title" className="mb-2 block text-sm font-medium">
            Titre
          </label>
          <input
            id="title"
            name="title"
            type="text"
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Ex. Fumée épaisse au-dessus du bois de…"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="desc" className="mb-2 block text-sm font-medium">
            Détails <span className="text-muted-foreground">(optionnel)</span>
          </label>
          <textarea
            id="desc"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Ce que vous voyez, l'ampleur, la direction…"
            className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>

        {/* Gravité */}
        <div>
          <label className="mb-2 block text-sm font-medium">Niveau perçu</label>
          <div className="flex gap-2">
            {SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm font-medium capitalize transition",
                  severity === s ? "text-foreground" : "border-border text-muted-foreground",
                )}
                style={
                  severity === s
                    ? {
                        borderColor: SEV_VAR[s],
                        background: `color-mix(in oklch, ${SEV_VAR[s]} 15%, transparent)`,
                      }
                    : undefined
                }
              >
                {SEVERITY_SHORT[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Localisation */}
        <div>
          <label className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <MapPin size={15} aria-hidden /> Emplacement
            <span className="font-normal text-muted-foreground">
              — touchez la carte pour préciser
            </span>
          </label>
          <div className="h-64 overflow-hidden rounded-xl border border-border">
            {mapCenter && (
              <MapView
                center={mapCenter}
                zoom={12}
                selectable
                onPick={setPicked}
                className="size-full"
              />
            )}
          </div>
          {loc && (
            <p className="mt-1.5 font-mono text-xs text-muted-foreground">
              {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
              {!picked && " (votre position)"}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-sev-red">{error}</p>}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send size={16} aria-hidden />
          {submitting ? "Envoi…" : "Envoyer le signalement"}
        </button>
      </div>
    </div>
  );
}

export default function SignalerPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-muted-foreground">Chargement…</div>}>
      <SignalerForm />
    </Suspense>
  );
}
