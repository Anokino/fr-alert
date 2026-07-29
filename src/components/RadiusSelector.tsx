"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Rayons proposés autour de la position, en km. */
export const RADII = [10, 25, 50, 100, 200, 500];

/** Zoom cadrant approximativement le rayon demandé. */
export function zoomForRadius(km: number): number {
  if (km <= 10) return 11;
  if (km <= 25) return 10;
  if (km <= 50) return 9;
  if (km <= 100) return 8;
  if (km <= 200) return 7;
  if (km <= 500) return 6;
  return 5;
}

/** Sélecteur de rayon d'observation. Partagé par la home et les pages de module. */
export function RadiusSelector({
  value,
  onChange,
  busy,
  className,
}: {
  value: number;
  onChange: (km: number) => void;
  /** Chargement en cours : l'option active affiche un spinner. */
  busy?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-border bg-surface p-0.5",
        className,
      )}
      role="group"
      aria-label="Rayon d'observation"
    >
      {RADII.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          aria-pressed={value === r}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition",
            value === r
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {busy && value === r && (
            <Loader2 size={13} className="animate-spin" aria-hidden />
          )}
          {r} km
        </button>
      ))}
    </div>
  );
}
