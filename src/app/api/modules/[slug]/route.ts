import { NextRequest, NextResponse } from "next/server";
import { collectIncidents, getModule, moduleMeta } from "@/core/registry";
import { bboxCenter, distanceKm, FRANCE_BBOX, parseBBox } from "@/core/geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/modules/[slug]?bbox=... — métadonnées + incidents d'un module donné.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const mod = getModule(slug);
  if (!mod) {
    return NextResponse.json({ error: "Module inconnu" }, { status: 404 });
  }

  const bbox = parseBBox(req.nextUrl.searchParams.get("bbox")) ?? FRANCE_BBOX;
  const center = bboxCenter(bbox);
  const { incidents, sources } = await collectIncidents({ bbox, center }, [slug]);

  incidents.sort((a, b) => {
    if (a.national && !b.national) return 1;
    if (!a.national && b.national) return -1;
    return (
      distanceKm(center, { lat: a.lat, lng: a.lng }) -
      distanceKm(center, { lat: b.lat, lng: b.lng })
    );
  });

  return NextResponse.json({
    module: moduleMeta(mod),
    incidents,
    meta: { generatedAt: new Date().toISOString(), sources },
  });
}
