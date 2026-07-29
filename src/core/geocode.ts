import { cached, fetchJson } from "./cache";
import type { LatLng } from "./types";

/** Un résultat de recherche d'adresse (forward geocoding). */
export interface GeoResult {
  label: string;
  lat: number;
  lng: number;
  /** housenumber | street | locality | municipality */
  type?: string;
  /** ex. "80, Somme, Hauts-de-France" */
  context?: string;
}

interface AdresseFeature {
  geometry: { coordinates: [number, number] };
  properties: { label: string; type?: string; context?: string };
}

/**
 * Recherche d'adresse → coordonnées (api-adresse.data.gouv.fr, keyless, GeoJSON).
 * Alimente la barre d'adresse : permet de désigner un point sans géolocalisation navigateur.
 * Fail-soft : laisse remonter (le route handler renvoie une liste vide).
 */
export async function geocodeAddress(
  query: string,
  limit = 5,
): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const key = `geocode:${q.toLowerCase()}:${limit}`;
  const data = await cached(key, 24 * 3600, () =>
    fetchJson<{ features: AdresseFeature[] }>(
      `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}` +
        `&limit=${limit}&autocomplete=1`,
    ),
  );
  return (data.features ?? []).map((f) => ({
    label: f.properties.label,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    type: f.properties.type,
    context: f.properties.context,
  }));
}

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
