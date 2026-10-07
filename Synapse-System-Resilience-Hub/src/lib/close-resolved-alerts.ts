import { getEasternBusinessDay } from "@/lib/business-day";
import { prisma } from "@/lib/prisma";
import { updateServiceNowIncident } from "@/lib/service-now";

export async function closeResolvedAlerts() {
  const candidates = await prisma.alert.findMany({
    where: {
      status: "RESOLVED",
      closedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      reference: true,
      serviceNowSysId: true,
      statusAudits: {
        where: { statusCode: "RESOLVED" },
        orderBy: { changedAt: "desc" },
        take: 1,
        select: { changedAt: true },
      },
    },
    take: 500,
  });
  const startOfDay = getEasternBusinessDay().start;
  const alerts = candidates.filter((alert) => alert.statusAudits[0]?.changedAt < startOfDay).slice(0, 100);

  let closed = 0;
  for (const alert of alerts) {
    if (alert.serviceNowSysId) {
      try {
        await updateServiceNowIncident(alert.serviceNowSysId, { status: "Closed" });
      } catch (error) {
        await prisma.activityEvent.create({
          data: {
            alertId: alert.id,
            action: "SERVICENOW_SYNC_FAILED",
            actor: "scheduler",
            details: { operation: "close", message: error instanceof Error ? error.message : "Unknown error" },
          },
        });
        console.error("ServiceNow incident closure failed.", alert.reference, error);
        continue;
      }
    }

    await prisma.$transaction([
      prisma.alert.update({ where: { id: alert.id }, data: { closedAt: new Date() } }),
      prisma.activityEvent.create({
        data: { alertId: alert.id, action: "ALERT_CLOSED", actor: "scheduler" },
      }),
    ]);
    closed += 1;
  }
  return closed;
}