import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getModule } from "@/core/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ReportInput = z.object({
  moduleSlug: z.string().min(1),
  title: z.string().min(3).max(120),
  description: z.string().max(1000).optional(),
  severity: z.enum(["green", "yellow", "orange", "red"]).default("yellow"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  contact: z.string().max(200).optional(),
});

/** GET /api/reports?module=fire — signalements récents (48 h). */
export async function GET(req: NextRequest) {
  const moduleSlug = req.nextUrl.searchParams.get("module") ?? undefined;
  const since = new Date(Date.now() - 48 * 3600 * 1000);
  const reports = await prisma.report.findMany({
    where: {
      status: { not: "rejected" },
      createdAt: { gte: since },
      ...(moduleSlug ? { moduleSlug } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      moduleSlug: true,
      title: true,
      description: true,
      severity: true,
      lat: true,
      lng: true,
      status: true,
      confirmations: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ reports });
}

/** POST /api/reports — créer un signalement citoyen. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const parsed = ReportInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const data = parsed.data;

  if (!getModule(data.moduleSlug)) {
    return NextResponse.json({ error: "Module inconnu" }, { status: 422 });
  }

  const report = await prisma.report.create({
    data: {
      moduleSlug: data.moduleSlug,
      title: data.title,
      description: data.description,
      severity: data.severity,
      lat: data.lat,
      lng: data.lng,
      contact: data.contact,
    },
    select: { id: true, moduleSlug: true, createdAt: true },
  });

  return NextResponse.json({ report }, { status: 201 });
}
