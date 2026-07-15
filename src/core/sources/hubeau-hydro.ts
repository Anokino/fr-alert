import { cached, fetchJson } from "../cache";
import type { Poi, PoiSource } from "../types";

interface HydroStation {
  code_station?: string;
  libelle_station?: string;
  longitude_station?: number;
  latitude_station?: number;
  en_service?: boolean;
  libelle_cours_eau?: string;
}
interface HydroResponse {
  data: HydroStation[];
}

/**
 * Stations hydrométriques temps réel (Hub'Eau) — contexte du module inondation.
 * API en v2 : la v1 de `hydrometrie` est retirée et répond 403 (≠ 404).
 */
export const hydroStationPoi: PoiSource = {
  id: "hydro-station",
  label: "Stations hydrométriques",
  attribution: "Hub'Eau · SCHAPI / Vigicrues",
  ttlSeconds: 24 * 3600,

  async fetch(ctx): Promise<Poi[]> {
    const [minLng, minLat, maxLng, maxLat] = ctx.bbox;
    const key = `hydro-station:${ctx.bbox.map((n) => n.toFixed(2)).join(",")}`;
    try {
      const data = await cached(key, this.ttlSeconds, () =>
        fetchJson<HydroResponse>(
          `https://hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations` +
            `?bbox=${minLng},${minLat},${maxLng},${maxLat}&size=200&format=json`,
        ),
      );
      return (data.data ?? [])
        .map((s): Poi | null => {
          if (s.latitude_station == null || s.longitude_station == null)
            return null;
          return {
            id: `hydro-station:${s.code_station}`,
            layerId: this.id,
            label: s.libelle_station ?? "Station",
            lat: s.latitude_station,
            lng: s.longitude_station,
            props: {
              coursEau: s.libelle_cours_eau,
              enService: s.en_service,
              code: s.code_station,
            },
          };
        })
        .filter((x): x is Poi => x !== null);
    } catch {
      return [];
    }
  },
};
