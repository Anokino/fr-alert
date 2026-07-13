import { NextResponse } from "next/server";
import { modules, moduleMeta } from "@/core/registry";

export const runtime = "nodejs";

/** GET /api/modules — liste des modules (métadonnées sérialisables). */
export async function GET() {
  return NextResponse.json({ modules: modules.map(moduleMeta) });
}
