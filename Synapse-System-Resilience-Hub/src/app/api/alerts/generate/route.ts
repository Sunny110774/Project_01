import { NextRequest, NextResponse } from "next/server";
import { closeResolvedAlerts } from "@/lib/close-resolved-alerts";
import { generateDummyAlerts } from "@/lib/dummy-alert-generator";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && (!cronSecret || authorization !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  try {
    const closed = await closeResolvedAlerts();
    const alerts = await generateDummyAlerts(1);
    return NextResponse.json({ success: true, generated: alerts.length, closed, alerts });
  } catch (error) {
    console.error("Hourly dummy alert generation failed.", error);
    return NextResponse.json({ error: "Unable to generate hourly dummy alert." }, { status: 500 });
  }
}

export async function POST() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  try {
    const alerts = await generateDummyAlerts(1);

    return NextResponse.json({ success: true, generated: alerts.length, alerts });
  } catch (error) {
    console.error("Dummy alert generation failed.", error);
    return NextResponse.json({ error: "Unable to generate dummy alerts." }, { status: 500 });
  }
}
