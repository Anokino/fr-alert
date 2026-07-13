import { cached, fetchJson } from "../cache";
import { bboxCenter } from "../geo";
import type { Incident, IncidentSource, Severity } from "../types";

interface OpenMeteoAir {
  hourly?: {
    time: string[];
    european_aqi?: (number | null)[];
    pm10?: (number | null)[];
    pm2_5?: (number | null)[];
    nitrogen_dioxide?: (number | null)[];
    ozone?: (number | null)[];
  };
}

/** EAQI → gravité (échelle European AQI simplifiée). */
function aqiSeverity(aqi: number): Severity {
  if (aqi <= 40) return "green";
  if (aqi <= 60) return "yellow";
  if (aqi <= 80) return "orange";
  return "red";
}

function aqiLabel(aqi: number): string {
  if (aqi <= 20) return "Très bonne";
  if (aqi <= 40) return "Bonne";
  if (aqi <= 60) return "Moyenne";
  if (aqi <= 80) return "Dégradée";
  if (aqi <= 100) return "Mauvaise";
  return "Très mauvaise";
}

export const openMeteoAirSource: IncidentSource = {
  id: "openmeteo-air",
  label: "Open-Meteo — Qualité de l'air",
  attribution: "Open-Meteo · CAMS",
  ttlSeconds: 30 * 60,

  async fetch(ctx): Promise<Incident[]> {
    const c = ctx.center ?? bboxCenter(ctx.bbox);
    const key = `openmeteo-air:${c.lat.toFixed(2)},${c.lng.toFixed(2)}`;
    const data = await cached(key, this.ttlSeconds, () =>
      fetchJson<OpenMeteoAir>(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${c.lat}&longitude=${c.lng}` +
          `&hourly=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone&forecast_days=1&timezone=auto`,
      ),
    );

    const h = data.hourly;
    if (!h?.european_aqi?.length) return [];

    // Index de l'heure courante (dernier créneau <= maintenant).
    const now = Date.now();
    let idx = 0;
    for (let i = 0; i < h.time.length; i++) {
      if (new Date(h.time[i]).getTime() <= now) idx = i;
    }
    const aqi = h.european_aqi[idx];
    if (aqi == null) return [];

    const severity = aqiSeverity(aqi);
    if (severity === "green") return []; // pas d'incident si l'air est bon

    return [
      {
        id: `openmeteo-air:${c.lat.toFixed(2)},${c.lng.toFixed(2)}`,
        moduleSlug: "air",
        title: `Qualité de l'air ${aqiLabel(aqi).toLowerCase()} (indice ${Math.round(aqi)})`,
        description: `Indice EAQI ${Math.round(aqi)} — ${aqiLabel(aqi)}.`,
        severity,
        lat: c.lat,
        lng: c.lng,
        startedAt: h.time[idx],
        sourceId: this.id,
        sourceLabel: this.label,
        props: {
          eaqi: Math.round(aqi),
          pm10: h.pm10?.[idx] ?? null,
          pm2_5: h.pm2_5?.[idx] ?? null,
          no2: h.nitrogen_dioxide?.[idx] ?? null,
          o3: h.ozone?.[idx] ?? null,
        },
      },
    ];
  },
};
