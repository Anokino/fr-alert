import { cached, fetchText } from "../cache";
import type { Incident, IncidentSource, Severity } from "../types";

/** Parse un CSV simple (sans champs entre guillemets, ce qui est le cas de FIRMS). */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cols[i]));
    return row;
  });
}

function frpSeverity(frp: number, confidence: string): Severity {
  const c = confidence?.toLowerCase();
  if (frp >= 50 || c === "h") return "red";
  if (frp >= 15 || c === "n") return "orange";
  return "yellow";
}

export const firmsSource: IncidentSource = {
  id: "firms",
  label: "NASA FIRMS — Feux actifs",
  attribution: "NASA FIRMS (VIIRS)",
  ttlSeconds: 15 * 60,
  requiresEnv: "FIRMS_MAP_KEY",

  async fetch(ctx): Promise<Incident[]> {
    const key = process.env.FIRMS_MAP_KEY;
    if (!key) return [];
    const [minLng, minLat, maxLng, maxLat] = ctx.bbox;
    const area = `${minLng},${minLat},${maxLng},${maxLat}`;
    const cacheKey = `firms:${ctx.bbox.map((n) => n.toFixed(2)).join(",")}`;

    const csv = await cached(cacheKey, this.ttlSeconds, () =>
      fetchText(
        `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/${area}/1`,
      ),
    );

    return parseCsv(csv)
      .map((r, i): Incident | null => {
        const lat = Number(r.latitude);
        const lng = Number(r.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
        const frp = Number(r.frp) || 0;
        const acq = `${r.acq_date}T${(r.acq_time ?? "0000").padStart(4, "0").replace(/(\d{2})(\d{2})/, "$1:$2")}:00Z`;
        return {
          id: `firms:${r.acq_date}:${lat.toFixed(3)},${lng.toFixed(3)}:${i}`,
          moduleSlug: "fire",
          title: "Foyer thermique détecté (satellite)",
          description: `Détection VIIRS — puissance radiative ${frp.toFixed(0)} MW, confiance ${r.confidence ?? "?"}.`,
          severity: frpSeverity(frp, r.confidence ?? ""),
          lat,
          lng,
          startedAt: acq,
          sourceId: this.id,
          sourceLabel: this.label,
          props: { frp, confidence: r.confidence, satellite: r.satellite },
        };
      })
      .filter((x): x is Incident => x !== null);
  },
};
