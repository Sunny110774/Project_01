import { NextRequest, NextResponse } from "next/server";
import { AlertStatusCode, Priority } from "@prisma/client";
import { getEasternBusinessDay } from "@/lib/business-day";
import { sendAlertEmail } from "@/lib/alert-email";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const slaByPriority: Record<Priority, number> = { P1: 30, P2: 60, P3: 240, P4: 480 };

function makeReference() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AL-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

function toClientAlert(alert: {
  reference: string;
  subject: string;
  sender: string;
  recipient: string | null;
  location: string | null;
  bodyText: string;
  priority: Priority;
  status: AlertStatusCode;
  assignee: { displayName: string } | null;
  createdAt: Date;
  severityDefinition: { slaMinutes: number };
  bodyHtml?: string | null;
  rawAlert?: { rawPayload: string } | null;
  serviceNowNumber?: string | null;
  serviceNowUrl?: string | null;
}) {
  const ageMinutes = Math.max(0, Math.floor((Date.now() - alert.createdAt.getTime()) / 60_000));
  const status = alert.status === "IN_PROGRESS" ? "In progress" : alert.status === "RESOLVED" ? "Resolved" : alert.assignee ? "Open" : "New";
  return {
    id: alert.reference,
    priority: alert.priority,
    subject: alert.subject,
    location: alert.location || "Location not provided",
    source: alert.sender,
    sender: alert.sender,
    recipient: alert.recipient,
    status,
    assignee: alert.assignee?.displayName || "Unassigned",
    created: alert.createdAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
    createdAt: alert.createdAt.toISOString(),
    ageMinutes,
    slaMinutes: alert.severityDefinition.slaMinutes,
    body: alert.bodyText,
      bodyHtml: alert.bodyHtml ?? null,
      rawEmail: alert.rawAlert?.rawPayload ?? null,
      ticket: alert.serviceNowNumber || alert.reference,
      ticketUrl: alert.serviceNowUrl ?? null,
  };
}

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const scope = request.nextUrl.searchParams.get("scope") ?? "dashboard";
  if (scope !== "dashboard" && scope !== "backlog") {
    return NextResponse.json({ error: "Scope must be dashboard or backlog." }, { status: 400 });
  }
  const now = new Date();
  const businessDay = getEasternBusinessDay(now);
  const where = scope === "dashboard"
    ? businessDay.isBeforeCutoff
      ? { createdAt: { gte: businessDay.start, lt: businessDay.cutoff } }
      : { createdAt: { gte: businessDay.cutoff, lt: businessDay.cutoff } }
    : {
        status: { not: "RESOLVED" as const },
        createdAt: { lt: businessDay.isBeforeCutoff ? businessDay.start : businessDay.nextStart },
      };
  try {
    const alerts = await prisma.alert.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: {
        severityDefinition: { select: { slaMinutes: true } },
        assignee: { select: { displayName: true } },
          rawAlert: { select: { rawPayload: true } },
      },
    });
    return NextResponse.json({ alerts: alerts.map(toClientAlert) });
  } catch (error) {
    console.error("Alert query failed.", error);
    return NextResponse.json({ error: "Could not load alerts from PostgreSQL." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON request." }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const body = payload as Record<string, unknown>;
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const details = typeof body.body === "string" ? body.body.trim() : "";
  const priority = typeof body.priority === "string" && body.priority in slaByPriority ? body.priority as Priority : null;
  const requestedRecipients = body.recipients === undefined
    ? []
    : Array.isArray(body.recipients) && body.recipients.every((value) => typeof value === "string")
      ? [...new Set(body.recipients.map((value) => value.trim().toLowerCase()).filter(Boolean))]
      : null;
  const validEmail = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
  if (requestedRecipients === null || requestedRecipients.length > 25 || requestedRecipients.some((email) => email.length > 254 || !validEmail.test(email))) {
    return NextResponse.json({ error: "Provide up to 25 valid department email addresses." }, { status: 400 });
  }
  if (!subject || subject.length > 500 || !location || location.length > 160 || !details || details.length > 20_000 || !priority) {
    return NextResponse.json({ error: "Alert summary, location, details, and a P1-P4 priority are required." }, { status: 400 });
  }
  try {
    const alert = await prisma.alert.create({
      data: {
        reference: makeReference(),
        subject,
        sender: "manual intake",
        recipient: requestedRecipients.length ? requestedRecipients.join(", ") : null,
        location,
        bodyText: details,
        statusDefinition: { connect: { code: "OPEN" } },
        severityDefinition: { connect: { code: priority } },
        rawAlert: {
          create: {
            source: "MANUAL",
            rawPayload: `From: manual intake\nTo: ${requestedRecipients.join(", ")}\nSubject: ${subject}\nLocation: ${location}\n\n${details}`,
          },
        },
        statusAudits: {
          create: {
            status: { connect: { code: "OPEN" } },
            actor: "manual intake",
            note: "Alert created from the dashboard.",
          },
        },
        severityAudits: {
          create: {
            severity: { connect: { code: priority } },
            actor: "manual intake",
            note: "Initial severity assigned during manual intake.",
          },
        },
        activities: { create: { action: "MANUAL_ALERT_CREATED" } },
      },
      include: {
        severityDefinition: { select: { slaMinutes: true } },
        assignee: { select: { displayName: true } },
        rawAlert: { select: { rawPayload: true } },
      },
    });
    let delivery: { status: string; message?: string } = { status: "not_requested" };
    if (requestedRecipients.length) {
      try {
        await sendAlertEmail(requestedRecipients, subject, `${details}\n\nAlert: ${alert.reference}\nLocation: ${location}\nPriority: ${priority}`);
        await prisma.activityEvent.create({
          data: { alertId: alert.id, action: "ALERT_EMAIL_SENT", actor: "dashboard", details: { recipients: requestedRecipients } },
        });
        delivery = { status: "sent" };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown email delivery error.";
        await prisma.activityEvent.create({
          data: { alertId: alert.id, action: "ALERT_EMAIL_FAILED", actor: "dashboard", details: { message } },
        });
        delivery = { status: "failed", message };
      }
    }
    return NextResponse.json({ alert: toClientAlert(alert), delivery }, { status: 201 });
  } catch (error) {
    console.error("Manual alert creation failed.", error);
    return NextResponse.json({ error: "Could not save the alert." }, { status: 500 });
  }
}
