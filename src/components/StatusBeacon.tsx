"use client";

import { Check, ShieldCheck } from "lucide-react";
import type { Severity } from "@/core/types";
import { SEVERITY_LABEL } from "@/core/severity";
import { cn } from "@/lib/utils";

const SEV_VAR: Record<Severity, string> = {
  green: "var(--sev-green)",
  yellow: "var(--sev-yellow)",
  orange: "var(--sev-orange)",
  red: "var(--sev-red)",
};

export function StatusBeacon({
  severity,
  count,
  place,
  loading,
}: {
  severity: Severity;
  count: number;
  place?: string;
  loading?: boolean;
}) {
  const color = SEV_VAR[severity];
  const calm = severity === "green" || count === 0;
  const animate = !loading && !calm;

  const headline = loading
    ? "Analyse de votre secteur…"
    : calm
      ? "Aucun danger signalé près de vous"
      : count === 1
        ? "1 incident à proximité"
        : `${count} incidents à proximité`;

  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="relative grid size-44 place-items-center sm:size-52"
        style={{ color }}
      >
        {/* Ondes concentriques (masquées si reduced-motion via CSS global) */}
        {animate && (
          <>
            <span className="absolute inset-0 animate-ping rounded-full opacity-20 [animation-duration:2.4s]" style={{ background: color }} />
            <span className="absolute inset-4 animate-ping rounded-full opacity-25 [animation-duration:2.4s] [animation-delay:.4s]" style={{ background: color }} />
          </>
        )}
        {/* Anneaux statiques */}
        <span className="absolute inset-0 rounded-full border" style={{ borderColor: `color-mix(in oklch, ${color} 30%, transparent)` }} />
        <span className="absolute inset-6 rounded-full border" style={{ borderColor: `color-mix(in oklch, ${color} 45%, transparent)` }} />

        {/* Coeur */}
        <div
          className={cn(
            "relative grid size-28 place-items-center rounded-full sm:size-32",
            loading && "animate-pulse",
          )}
          style={{
            background: `color-mix(in oklch, ${color} 18%, var(--surface))`,
            boxShadow: `0 0 40px color-mix(in oklch, ${color} 35%, transparent)`,
            border: `1px solid color-mix(in oklch, ${color} 50%, transparent)`,
          }}
        >
          {calm && !loading ? (
            <ShieldCheck size={44} strokeWidth={1.8} aria-hidden />
          ) : loading ? (
            <span className="font-mono text-sm text-muted-foreground">…</span>
          ) : (
            <span className="font-display text-5xl font-bold tabular-nums">
              {count}
            </span>
          )}
        </div>
      </div>

      <h1
        role="status"
        aria-live="polite"
        className="mt-6 text-balance font-display text-2xl font-bold tracking-tight sm:text-3xl"
      >
        {headline}
      </h1>
      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
        {place ? (
          <>
            <span>Autour de</span>
            <span className="font-medium text-foreground">{place}</span>
          </>
        ) : (
          <span>Localisation en cours…</span>
        )}
      </p>
      {!loading && !calm && (
        <p className="mt-1 text-sm font-medium" style={{ color }}>
          {SEVERITY_LABEL[severity]}
        </p>
      )}
      {calm && !loading && (
        <p className="mt-1 flex items-center gap-1 text-sm text-sev-green">
          <Check size={15} aria-hidden /> Situation normale
        </p>
      )}
    </div>
  );
}
