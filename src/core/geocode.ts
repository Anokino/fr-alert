import { cached, fetchJson } from "./cache";
import type { LatLng } from "./types";

export interface Commune {
  code: string;
  nom: string;
  centre?: { type: "Point"; coordinates: [number, number] };
  codesPostaux?: string[];
  codeDepartement?: string;
}

// `null` signifie « pas de commune à cet endroit » (point hors de France, code inconnu) —
// c'est un résultat, pas une panne. Une erreur réseau *remonte* : le fail-soft appartient au
// registre (cf. CONTEXT.md §8). Sans cette distinction, geo.api.gouv.fr indisponible ferait
// répondre « eau potable conforme / aucune vigilance » à une app qui n'a rien pu vérifier.

/** Reverse-geocode : commune contenant un point (geo.api.gouv.fr, keyless). */
export async function reverseCommune(p: LatLng): Promise<Commune | null> {
  const key = `commune-rev:${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
  const list = await cached(key, 24 * 3600, () =>
    fetchJson<Commune[]>(
      `https://geo.api.gouv.fr/communes?lat=${p.lat}&lon=${p.lng}` +
        `&fields=nom,code,centre,codesPostaux,codeDepartement&format=json`,
    ),
  );
  return list[0] ?? null;
}

/** Centroïde d'une commune par code INSEE. */
export async function communeCentroid(code: string): Promise<LatLng | null> {
  const key = `commune-centre:${code}`;
  const list = await cached(key, 24 * 3600, () =>
    fetchJson<Commune[]>(
      `https://geo.api.gouv.fr/communes?code=${code}&fields=centre&format=json`,
    ),
  );
  const c = list[0]?.centre?.coordinates;
  return c ? { lat: c[1], lng: c[0] } : null;
}
