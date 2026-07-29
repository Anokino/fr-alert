"use client";

/**
 * Synchronisation légère de l'état d'une vue avec la query string de l'URL.
 *
 * But : une URL décrit entièrement la zone et le filtre observés (point, rayon, couches…),
 * partageable et rejouable — et directement consommable par l'API et la future app mobile.
 * On écrit via `history.replaceState` (pas de navigation ni de re-render, pas de boucle).
 */

/** Nombre lu depuis la query string, ou `undefined` si absent/invalide. */
export function readNumParam(key: string): number | undefined {
  if (typeof window === "undefined") return undefined;
  // Clé absente : ne PAS retourner 0 (`Number(null) === 0`), sinon un rayon manquant
  // deviendrait 0 et la vue se réduirait à un point.
  const raw = new URLSearchParams(window.location.search).get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const v = Number(raw);
  return Number.isFinite(v) ? v : undefined;
}

/** Chaîne lue depuis la query string, ou `undefined`. */
export function readStrParam(key: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get(key) ?? undefined;
}

/** Met à jour la query string en place. `null`/`""` supprime la clé. */
export function writeParams(
  patch: Record<string, string | number | null | undefined>,
): void {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") sp.delete(k);
    else sp.set(k, String(v));
  }
  const qs = sp.toString();
  window.history.replaceState(
    null,
    "",
    qs ? `?${qs}` : window.location.pathname,
  );
}
