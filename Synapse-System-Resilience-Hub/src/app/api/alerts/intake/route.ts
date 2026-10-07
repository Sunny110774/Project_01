import { NextRequest, NextResponse } from "next/server";
import { Priority } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function classifyPriority(subject: string, body: string): Priority {
  const text = `${subject} ${body}`.toLowerCase();
  if (/\bp1\b|sev(?:erity)?\s*1|critical|complete outage|all users unable|data loss/.test(text)) return "P1";
  if (/\bp2\b|sev(?:erity)?\s*2|major degradation|service unavailable|many users/.test(text)) return "P2";
  if (/\bp4\b|sev(?:erity)?\s*4|minor request|how do i|information only/.test(text)) return "P4";
  return "P3";
}

export async function POST(request: NextRequest) {
  const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Email intake is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 1_000_000) return NextResponse.json({ error: "Email payload exceeds 1 MB." }, { status: 413 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON email payload." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "Invalid email payload." }, { status: 400 });
  const email = payload as Record<string, unknown>;
  const subject = typeof email.subject === "string" ? email.subject.trim() : "";
  const sender = typeof email.from === "string" ? email.from.trim() : "";
  const bodyText = typeof email.text === "string" ? email.text : "";
  const rawEmail = typeof email.rawEmail === "string" ? email.rawEmail : "";
  const bodyHtml = typeof email.html === "string" ? email.html : null;
  const messageId = typeof email.messageId === "string" ? email.messageId.trim() : null;
  const recipient = typeof email.to === "string" ? email.to.trim() : null;
  const location = typeof email.location === "string" ? email.location.trim().slice(0, 160) : null;

  if (!subject || subject.length > 500 || !sender || sender.length > 320 || !bodyText || bodyText.length > 100_000 || !rawEmail || rawEmail.length > 500_000) {
    return NextResponse.json({ error: "Required fields: from, subject, text, rawEmail. Field size limits apply." }, { status: 400 });
  }

  const priority = classifyPriority(subject, bodyText);
  try {
    const alert = await prisma.alert.create({
      data: {
        subject,
        sender,
        recipient,
        location,
        bodyText,
        bodyHtml,
        statusDefinition: { connect: { code: "OPEN" } },
        severityDefinition: { connect: { code: priority } },
        rawAlert: {
          create: {
            source: "EMAIL",
            rawPayload: rawEmail,
            messageId,
          },
        },
        statusAudits: {
          create: {
            status: { connect: { code: "OPEN" } },
            actor: sender,
            note: "Initial status recorded from email intake.",
          },
        },
        severityAudits: {
          create: {
            severity: { connect: { code: priority } },
            actor: sender,
            note: "Initial severity assigned by the intake classifier.",
          },
        },
        activities: { create: { action: "EMAIL_RECEIVED", actor: sender } },
      },
      select: {
        id: true,
        reference: true,
        priority: true,
        status: true,
        createdAt: true,
        severityDefinition: { select: { slaMinutes: true } },
      },
    });
    return NextResponse.json(alert, { status: 201 });
  } catch (error) {
    if (messageId && error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "This email has already been received." }, { status: 409 });
    }
    console.error("Email intake persistence failed.", error);
    return NextResponse.json({ error: "Could not persist the inbound email." }, { status: 500 });
  }
}
