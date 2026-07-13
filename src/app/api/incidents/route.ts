import { NextRequest, NextResponse } from "next/server";
import { collectIncidents } from "@/core/registry";
import { bboxCenter, parseBBox, FRANCE_BBOX } from "@/core/geo";
import { distanceKm } from "@/core/geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/incidents?bbox=minLng,minLat,maxLng,maxLat&modules=fire,flood
 * Agrège les incidents de tous les modules (ou d'une sélection) dans la zone.
 * Réponse : { incidents, meta:{ generatedAt, sources[] } }.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const bbox = parseBBox(params.get("bbox")) ?? FRANCE_BBOX;
  const modulesParam = params.get("modules");
  const moduleSlugs = modulesParam
    ? modulesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const center = bboxCenter(bbox);
  const { incidents, sources } = await collectIncidents(
    { bbox, center },
    moduleSlugs,
  );

  // Tri par proximité au centre (les nationaux en fin de liste).
  incidents.sort((a, b) => {
    if (a.national && !b.national) return 1;
    if (!a.national && b.national) return -1;
    return (
      distanceKm(center, { lat: a.lat, lng: a.lng }) -
      distanceKm(center, { lat: b.lat, lng: b.lng })
    );
  });

  return NextResponse.json({
    incidents,
    meta: { generatedAt: new Date().toISOString(), sources },
  });
}
