"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, LocateFixed, MapPin, Loader2, Search } from "lucide-react";
import type { LatLng } from "@/core/types";
import { cn } from "@/lib/utils";

export type LocationMode = "geo" | "address" | "national";

interface Result {
  label: string;
  lat: number;
  lng: number;
  context?: string;
}

/** Détecte une saisie de coordonnées « lat, lng » (ou « lat lng »), virgule décimale tolérée. */
function parseCoords(s: string): LatLng | null {
  const m = s
    .trim()
    .match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(",", "."));
  const lng = parseFloat(m[2].replace(",", "."));
  if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  return null;
}

const TABS: { id: LocationMode; label: string; icon: typeof MapPin }[] = [
  { id: "geo", label: "Ma position", icon: LocateFixed },
  { id: "address", label: "Adresse", icon: Search },
  { id: "national", label: "National", icon: Globe },
];

/**
 * Choix du point d'observation : géolocalisation, **adresse** (ou coordonnées GPS), ou vue
 * nationale. Indispensable pour les appareils sans géoloc ou quand elle échoue. La sélection
 * d'adresse consomme `/api/geo/search` (autocomplétion) et remonte un point via `onPoint`.
 */
export function LocationBar({
  mode,
  onMode,
  onPoint,
  currentLabel,
  className,
}: {
  mode: LocationMode;
  onMode: (m: LocationMode) => void;
  onPoint: (p: LatLng, label: string) => void;
  currentLabel?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const coords = parseCoords(query);

  // Autocomplétion debouncée (ignorée si la saisie est déjà des coordonnées, mais on ouvre
  // alors le menu pour proposer « aller aux coordonnées »). `coords` est recalculé ici et
  // NON mis en dépendance : c'est un objet recréé à chaque render, il boucerait l'effet.
  useEffect(() => {
    const c = parseCoords(query);
    if (c) {
      setResults([]);
      setOpen(true);
      return;
    }
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(
          `/api/geo/search?q=${encodeURIComponent(query)}&limit=5`,
        );
        setResults((await r.json()).results ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // Fermer le menu au clic extérieur.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(p: LatLng, label: string) {
    onPoint(p, label);
    setQuery(label);
    setResults([]);
    setOpen(false);
  }

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {/* Sélecteur de mode */}
      <div
        className="inline-flex rounded-lg border border-border bg-surface p-0.5"
        role="tablist"
        aria-label="Point d'observation"
      >
        {TABS.map((t) => {
          const active = mode === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => onMode(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon size={14} aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Champ d'adresse (mode adresse uniquement) */}
      {mode === "address" && (
        <div ref={boxRef} className="relative w-full max-w-md">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            {searching ? (
              <Loader2 size={15} className="animate-spin text-muted-foreground" aria-hidden />
            ) : (
              <Search size={15} className="text-muted-foreground" aria-hidden />
            )}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length && setOpen(true)}
              placeholder="Adresse, commune ou coordonnées GPS…"
              aria-label="Rechercher une adresse"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {open && (coords || results.length > 0) && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface-2 shadow-lg">
              {coords && (
                <li>
                  <button
                    onClick={() =>
                      pick(coords, `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`)
                    }
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface"
                  >
                    <MapPin size={14} className="shrink-0 text-primary" aria-hidden />
                    Aller aux coordonnées {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                  </button>
                </li>
              )}
              {results.map((r) => (
                <li key={`${r.lat},${r.lng},${r.label}`}>
                  <button
                    onClick={() => pick(r, r.label)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-surface"
                  >
                    <MapPin size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{r.label}</span>
                      {r.context && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.context}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {mode !== "address" && currentLabel && (
        <p className="text-xs text-muted-foreground">{currentLabel}</p>
      )}
    </div>
  );
}
