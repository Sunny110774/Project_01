import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AlertStatusCode, Priority, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createServiceNowIncident, isServiceNowConfigured, updateServiceNowIncident } from "@/lib/service-now";

export const runtime = "nodejs";

const statusToDatabase: Record<string, AlertStatusCode> = { New: "OPEN", Open: "OPEN", "In progress": "IN_PROGRESS", Resolved: "RESOLVED" };
const validPriorities = new Set<Priority>(["P1", "P2", "P3", "P4"]);

function usernameForDisplayName(displayName: string) {
  const normalized = displayName.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "user";
  const suffix = createHash("md5").update(displayName).digest("hex").slice(0, 6);
  return `${normalized}.${suffix}`;
}

type RouteContext = { params: Promise<{ reference: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const { reference } = await context.params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON request." }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const body = payload as Record<string, unknown>;
  const data: Prisma.AlertUpdateInput = {};
  const activity: { action: string; details?: { status?: AlertStatusCode; priority?: Priority; assignedTo?: string | null } } = { action: "ALERT_UPDATED" };
  const hasAssigneeUpdate = Object.hasOwn(body, "assignee");
  let assigneeName: string | null = null;

  if (typeof body.status === "string") {
    const status = statusToDatabase[body.status];
    if (!status) return NextResponse.json({ error: "Status must be New, Open, In progress, or Resolved." }, { status: 400 });
    data.statusDefinition = { connect: { code: status } };
    data.closedAt = null;
    if (status === "IN_PROGRESS") data.firstRespondedAt = new Date();
    activity.action = status === "RESOLVED" ? "ALERT_RESOLVED" : status === "IN_PROGRESS" ? "ALERT_STARTED" : "ALERT_REOPENED";
    activity.details = { status };
    data.statusAudits = {
      create: {
        status: { connect: { code: status } },
        actor: "dashboard",
        note: `Status changed to ${body.status}.`,
      },
    };
  }
  if (typeof body.priority === "string") {
    if (!validPriorities.has(body.priority as Priority)) {
      return NextResponse.json({ error: "Priority must be P1, P2, P3, or P4." }, { status: 400 });
    }
    const priority = body.priority as Priority;
    data.severityDefinition = { connect: { code: priority } };
    data.severityAudits = {
      create: {
        severity: { connect: { code: priority } },
        actor: "dashboard",
        note: `Severity changed to ${priority}.`,
      },
    };
    activity.action = "ALERT_SEVERITY_CHANGED";
    activity.details = { priority };
  }
  if (hasAssigneeUpdate) {
    if (body.assignee !== null && (typeof body.assignee !== "string" || body.assignee.trim().length > 120)) {
      return NextResponse.json({ error: "Assignee must be a name up to 120 characters." }, { status: 400 });
    }
    assigneeName = typeof body.assignee === "string" && body.assignee.trim() ? body.assignee.trim() : null;
    activity.action = "ALERT_ASSIGNED";
    activity.details = { assignedTo: assigneeName };
  }
  if (!data.statusDefinition && !data.severityDefinition && !hasAssigneeUpdate) {
    return NextResponse.json({ error: "No supported alert updates were provided." }, { status: 400 });
  }
  data.activities = { create: activity };

  try {
    const currentAlert = await prisma.alert.findUnique({
      where: { reference },
      select: {
        id: true,
        subject: true,
        bodyText: true,
        status: true,
        serviceNowSysId: true,
        serviceNowNumber: true,
      },
    });
    if (!currentAlert) return NextResponse.json({ error: "Alert not found." }, { status: 404 });

    const alert = await prisma.$transaction(async (transaction) => {
      if (hasAssigneeUpdate) {
        if (assigneeName) {
          const username = usernameForDisplayName(assigneeName);
          const user = await transaction.user.upsert({
            where: { username },
            update: {},
            create: {
              username,
              displayName: assigneeName,
              auditEntries: {
                create: {
                  action: "USER_CREATED_FROM_ALERT_ASSIGNMENT",
                  details: { source: "alert-assignment" },
                },
              },
            },
          });
          data.assignee = { connect: { id: user.id } };
        } else {
          data.assignee = { disconnect: true };
        }
      }

      const updatedAlert = await transaction.alert.update({
        where: { reference },
        data,
        select: {
          reference: true,
          status: true,
          assignee: { select: { displayName: true } },
          closedAt: true,
          firstRespondedAt: true,
        },
      });
      return { ...updatedAlert, assignedTo: updatedAlert.assignee?.displayName ?? null };
    });

    let serviceNow: { status: string; number?: string; message?: string } = { status: "not_applicable" };
    const nextStatus = typeof body.status === "string"
      ? body.status
      : currentAlert.status === "IN_PROGRESS" ? "In progress" : currentAlert.status === "RESOLVED" ? "Resolved" : "Open";
    if (currentAlert.serviceNowSysId && isServiceNowConfigured()) {
      try {
        await updateServiceNowIncident(currentAlert.serviceNowSysId, {
          ...(typeof body.status === "string" ? { status: nextStatus } : {}),
          ...(hasAssigneeUpdate ? { assignee: assigneeName } : {}),
        });
        serviceNow = { status: "synced", number: currentAlert.serviceNowNumber ?? undefined };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown ServiceNow error.";
        await prisma.activityEvent.create({
          data: { alertId: currentAlert.id, action: "SERVICENOW_SYNC_FAILED", actor: "dashboard", details: { message } },
        });
        serviceNow = { status: "failed", message };
      }
    } else if (hasAssigneeUpdate && assigneeName) {
      if (isServiceNowConfigured()) {
        try {
          const ticket = await createServiceNowIncident({
            reference,
            subject: currentAlert.subject,
            bodyText: currentAlert.bodyText,
            status: nextStatus,
            assignee: assigneeName,
          });
          await prisma.$transaction([
            prisma.alert.update({
              where: { id: currentAlert.id },
              data: { serviceNowSysId: ticket.sysId, serviceNowNumber: ticket.number, serviceNowUrl: ticket.url },
            }),
            prisma.activityEvent.create({
              data: {
                alertId: currentAlert.id,
                action: "SERVICENOW_INCIDENT_CREATED",
                actor: "dashboard",
                details: { number: ticket.number, assignedTo: assigneeName },
              },
            }),
          ]);
          serviceNow = { status: "created", number: ticket.number };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown ServiceNow error.";
          await prisma.activityEvent.create({
            data: { alertId: currentAlert.id, action: "SERVICENOW_SYNC_FAILED", actor: "dashboard", details: { message } },
          });
          serviceNow = { status: "failed", message };
        }
      } else {
        const message = "ServiceNow is not configured on the server.";
        await prisma.activityEvent.create({
          data: { alertId: currentAlert.id, action: "SERVICENOW_SYNC_SKIPPED", actor: "dashboard", details: { message } },
        });
        serviceNow = { status: "not_configured", message };
      }
    }
    return NextResponse.json({ alert, serviceNow });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Alert not found." }, { status: 404 });
    }
    console.error("Alert update failed.", error);
    return NextResponse.json({ error: "Could not update the alert." }, { status: 500 });
  }
}
