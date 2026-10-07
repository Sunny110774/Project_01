import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  try {
    const events = await prisma.activityEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        action: true,
        actor: true,
        details: true,
        createdAt: true,
        alert: { select: { reference: true, subject: true } },
      },
    });
    return NextResponse.json({ events });
  } catch (error) {
    console.error("Operations log lookup failed.", error);
    return NextResponse.json({ error: "Could not load operations logs." }, { status: 503 });
  }
}