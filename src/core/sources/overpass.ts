import { cached, fetchWithTimeout } from "../cache";
import { bboxLatLngStr } from "../geo";
import type { Poi, PoiSource } from "../types";

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}
interface OverpassResponse {
  elements: OverpassElement[];
}

const ENDPOINT = "https://overpass-api.de/api/interpreter";

/**
 * Fabrique une source de POI Overpass à partir d'un filtre OSM.
 * `filter` est un sélecteur OSM (ex. `["emergency"="fire_hydrant"]`).
 */
export function makeOverpassPoi(opts: {
  id: string;
  label: string;
  filter: string;
  labelFrom?: (tags: Record<string, string>) => string;
  ttlSeconds?: number;
}): PoiSource {
  return {
    id: opts.id,
    label: opts.label,
    attribution: "© OpenStreetMap contributors",
    ttlSeconds: opts.ttlSeconds ?? 24 * 3600,

    async fetch(ctx): Promise<Poi[]> {
      const bounds = bboxLatLngStr(ctx.bbox); // south,west,north,east
      const key = `overpass:${opts.id}:${ctx.bbox.map((n) => n.toFixed(2)).join(",")}`;
      const ql =
        `[out:json][timeout:20];` +
        `nwr${opts.filter}(${bounds});` +
        `out center 400;`;

      const data = await cached(key, this.ttlSeconds, async () => {
        const res = await fetchWithTimeout(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: ql,
        });
        if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
        return (await res.json()) as OverpassResponse;
      });

      return (data.elements ?? [])
        .map((el): Poi | null => {
          const lat = el.lat ?? el.center?.lat;
          const lon = el.lon ?? el.center?.lon;
          if (lat == null || lon == null) return null;
          const tags = el.tags ?? {};
          return {
            id: `${opts.id}:${el.type}/${el.id}`,
            layerId: opts.id,
            label: opts.labelFrom
              ? opts.labelFrom(tags)
              : tags.name ?? opts.label,
            lat,
            lng: lon,
            props: tags,
          };
        })
        .filter((x): x is Poi => x !== null);
    },
  };
}

/** Bornes / poteaux incendie. */
export const fireHydrantPoi = makeOverpassPoi({
  id: "fire-hydrant",
  label: "Bornes incendie",
  filter: `["emergency"="fire_hydrant"]`,
  labelFrom: (t) => t.ref ?? "Borne incendie",
});

/** Casernes de pompiers. */
export const fireStationPoi = makeOverpassPoi({
  id: "fire-station",
  label: "Casernes de pompiers",
  filter: `["amenity"="fire_station"]`,
  labelFrom: (t) => t.name ?? "Caserne",
});

/** Mairies (point de rassemblement / info en cas de crise). */
export const townhallPoi = makeOverpassPoi({
  id: "townhall",
  label: "Mairies",
  filter: `["amenity"="townhall"]`,
  labelFrom: (t) => t.name ?? "Mairie",
});
