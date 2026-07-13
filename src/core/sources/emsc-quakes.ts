import { cached, fetchWithTimeout } from "../cache";
import type { Incident, IncidentSource, Severity } from "../types";

interface QuakeFeature {
  id: string;
  properties: {
    mag: number;
    time: string;
    flynn_region?: string;
    depth?: number;
    magtype?: string;
    unid?: string;
  };
  geometry: { coordinates: [number, number, number] }; // [lng, lat, depth(-)]
}
interface QuakeCollection {
  features: QuakeFeature[];
}

function magSeverity(mag: number): Severity {
  if (mag < 2.5) return "green";
  if (mag < 4) return "yellow";
  if (mag < 5) return "orange";
  return "red";
}

export const emscQuakesSource: IncidentSource = {
  id: "emsc",
  label: "EMSC — Séismes",
  attribution: "EMSC-CSEM seismicportal.eu",
  ttlSeconds: 2 * 60,

  async fetch(ctx): Promise<Incident[]> {
    const [minLng, minLat, maxLng, maxLat] = ctx.bbox;
    const key = `emsc:${ctx.bbox.map((n) => n.toFixed(2)).join(",")}`;
    const start = new Date(Date.now() - 30 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const data = await cached(key, this.ttlSeconds, async () => {
      const res = await fetchWithTimeout(
        `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=100` +
          `&minlat=${minLat}&maxlat=${maxLat}&minlon=${minLng}&maxlon=${maxLng}` +
          `&start=${start}&orderby=time`,
      );
      // FDSN renvoie 204 (No Content) quand aucun événement ne correspond.
      if (res.status === 204) return { features: [] } as QuakeCollection;
      if (!res.ok) throw new Error(`EMSC HTTP ${res.status}`);
      const text = await res.text();
      if (!text.trim()) return { features: [] } as QuakeCollection;
      return JSON.parse(text) as QuakeCollection;
    });

    return (data.features ?? [])
      .map((f): Incident | null => {
        const p = f.properties;
        if (p.mag == null) return null;
        const [lng, lat] = f.geometry.coordinates;
        const severity = magSeverity(p.mag);
        if (severity === "green") return null; // micro-séismes non notables
        return {
          id: `emsc:${f.id ?? p.unid}`,
          moduleSlug: "quake",
          title: `Séisme M${p.mag.toFixed(1)} — ${p.flynn_region ?? "zone inconnue"}`,
          description: `Magnitude ${p.mag.toFixed(1)} (${p.magtype ?? "ml"}), profondeur ${Math.abs(p.depth ?? 0).toFixed(0)} km.`,
          severity,
          lat,
          lng,
          startedAt: p.time,
          sourceId: this.id,
          sourceLabel: this.label,
          url: p.unid
            ? `https://www.seismicportal.eu/eventdetails.html?unid=${p.unid}`
            : undefined,
          props: {
            magnitude: p.mag,
            magtype: p.magtype,
            depthKm: Math.abs(p.depth ?? 0),
            region: p.flynn_region,
          },
        };
      })
      .filter((x): x is Incident => x !== null);
  },
};
