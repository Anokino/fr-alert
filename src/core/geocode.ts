import { cached, fetchJson } from "./cache";
import type { LatLng } from "./types";

export interface Commune {
  code: string;
  nom: string;
  centre?: { type: "Point"; coordinates: [number, number] };
  codesPostaux?: string[];
  codeDepartement?: string;
}

/** Reverse-geocode : commune contenant un point (geo.api.gouv.fr, keyless). */
export async function reverseCommune(p: LatLng): Promise<Commune | null> {
  const key = `commune-rev:${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
  try {
    const list = await cached(key, 24 * 3600, () =>
      fetchJson<Commune[]>(
        `https://geo.api.gouv.fr/communes?lat=${p.lat}&lon=${p.lng}` +
          `&fields=nom,code,centre,codesPostaux,codeDepartement&format=json`,
      ),
    );
    return list[0] ?? null;
  } catch {
    return null;
  }
}

/** Centroïde d'une commune par code INSEE. */
export async function communeCentroid(code: string): Promise<LatLng | null> {
  const key = `commune-centre:${code}`;
  try {
    const list = await cached(key, 24 * 3600, () =>
      fetchJson<Commune[]>(
        `https://geo.api.gouv.fr/communes?code=${code}&fields=centre&format=json`,
      ),
    );
    const c = list[0]?.centre?.coordinates;
    return c ? { lat: c[1], lng: c[0] } : null;
  } catch {
    return null;
  }
}
