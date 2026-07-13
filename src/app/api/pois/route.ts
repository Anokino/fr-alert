import { NextRequest, NextResponse } from "next/server";
import { collectPois } from "@/core/registry";
import { bboxCenter, parseBBox } from "@/core/geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pois?module=fire&layers=fire-hydrant,fire-station&bbox=...
 * Renvoie les POIs contextuels d'un module dans la zone.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const moduleSlug = params.get("module");
  if (!moduleSlug) {
    return NextResponse.json({ error: "Paramètre 'module' requis" }, { status: 400 });
  }
  const bbox = parseBBox(params.get("bbox"));
  if (!bbox) {
    return NextResponse.json(
      { error: "Paramètre 'bbox' requis et valide" },
      { status: 400 },
    );
  }
  const layersParam = params.get("layers");
  const layerIds = layersParam
    ? layersParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const { pois, sources } = await collectPois(
    { bbox, center: bboxCenter(bbox) },
    moduleSlug,
    layerIds,
  );

  return NextResponse.json({
    pois,
    meta: { generatedAt: new Date().toISOString(), sources },
  });
}
