import { NextRequest, NextResponse } from "next/server";
import { collectPois } from "@/core/registry";
import { bboxCenter, bboxFromParams } from "@/core/geo";

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
  const bbox = bboxFromParams(params);
  if (!bbox) {
    return NextResponse.json(
      { error: "Zone requise : 'bbox' ou 'lat'+'lng'(+'r')" },
      { status: 400 },
    );
  }
  const layersParam = params.get("layers");
  const layerIds = layersParam
    ? layersParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  // Paramètres de couche réglables (tout sauf les clés réservées). Ex. `days` pour la
  // fenêtre temporelle des périmètres de feux.
  const RESERVED = new Set(["module", "bbox", "layers", "lat", "lng", "r"]);
  const layerParams: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    if (!RESERVED.has(k)) layerParams[k] = v;
  }

  const { pois, sources } = await collectPois(
    { bbox, center: bboxCenter(bbox), params: layerParams },
    moduleSlug,
    layerIds,
  );

  return NextResponse.json({
    pois,
    meta: { generatedAt: new Date().toISOString(), sources },
  });
}
