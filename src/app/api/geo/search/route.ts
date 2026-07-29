import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/core/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/geo/search?q=<adresse>&limit=5
 * Recherche d'adresse → coordonnées (barre d'adresse, app + futur mobile).
 * Renvoie toujours `{ results: [] }`, jamais une erreur pour une source indisponible.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get("q") ?? "";
  const limit = Math.min(10, Math.max(1, Number(params.get("limit")) || 5));
  try {
    const results = await geocodeAddress(q, limit);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
