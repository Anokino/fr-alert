import { Icon } from "@/components/Icon";
import { SeverityBadge } from "@/components/SeverityBadge";
import type { Incident } from "@/core/types";
import { cn, timeAgo } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

export function IncidentCard({
  incident,
  moduleName,
  moduleIcon,
  accent,
  distanceKm,
  className,
}: {
  incident: Incident;
  moduleName?: string;
  moduleIcon?: string;
  accent?: string;
  distanceKm?: number;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "group relative flex gap-3 rounded-lg border border-border bg-surface p-3.5 transition hover:bg-surface-2",
        className,
      )}
    >
      <div
        className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md"
        style={{
          background: accent
            ? `color-mix(in oklch, ${accent} 16%, transparent)`
            : "var(--muted)",
          color: accent ?? "var(--foreground)",
        }}
      >
        <Icon name={moduleIcon ?? "map-pin"} size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-balance text-sm font-semibold leading-snug">
            {incident.title}
          </h3>
          <SeverityBadge severity={incident.severity} className="shrink-0" />
        </div>
        {incident.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {incident.description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {moduleName && <span className="font-medium">{moduleName}</span>}
          {typeof distanceKm === "number" && !incident.national && (
            <span className="font-mono">{distanceKm.toFixed(1)} km</span>
          )}
          {incident.national && <span>National</span>}
          {/* Pour un risque prévu, l'échéance est déjà dans le titre : ce libellé porte donc
              la fraîcheur de la donnée (date de diffusion). Sinon il afficherait « il y a
              7 min » — l'heure de début de l'échéance — pour un bulletin vieux de 7 h. */}
          <span>
            {timeAgo(
              incident.forecast
                ? (incident.updatedAt ?? incident.startedAt)
                : incident.startedAt,
            )}
          </span>
          <span className="truncate">{incident.sourceLabel}</span>
          {incident.url && (
            <a
              href={incident.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Détails <ExternalLink size={11} aria-hidden />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
