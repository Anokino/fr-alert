import { NextRequest, NextResponse } from "next/server";
import { reverseCommune } from "@/core/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/geo/reverse?lat=..&lng=.. — commune correspondant à un point. */
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json(
      { error: "lat/lng requis" },
      { status: 400 },
    );
  }
  const commune = await reverseCommune({ lat, lng });
  return NextResponse.json({ commune });
}
