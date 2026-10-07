import { AlertStatusCode, Priority } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const priorities: Priority[] = ["P1", "P2", "P3", "P4"];
const subjectTemplates = [
  "API latency detected in EU cluster",
  "Database connection pool saturation",
  "Authentication token refresh failure",
  "Storage queue lag above threshold",
  "Edge gateway unhealthy in us-west",
  "Customer checkout failures in APAC",
];

function makeReference() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AL-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

export async function generateDummyAlerts(count: number) {
  const created: Array<{ id: string; subject: string; priority: Priority; status: AlertStatusCode }> = [];

  for (let index = 0; index < count; index += 1) {
    const priority = priorities[Math.floor(Math.random() * priorities.length)];
    const status: AlertStatusCode = "OPEN";
    const subject = subjectTemplates[Math.floor(Math.random() * subjectTemplates.length)];
    const createdAt = new Date(Date.now() - index * 45 * 60 * 1000);
    const alert = await prisma.alert.create({
      data: {
        reference: makeReference(),
        subject,
        sender: "generated-demo@internal.local",
        recipient: "operations@northstar.example",
        location: ["London", "New York", "Singapore", "Berlin"][Math.floor(Math.random() * 4)],
        bodyText: `Generated dummy alert for operational testing. Priority: ${priority}. This alert is new and unassigned.`,
        priority,
        status,
        createdAt,
        rawAlert: {
          create: {
            source: "DEMO",
            rawPayload: `Generated alert\nPriority: ${priority}\nStatus: ${status}`,
            messageId: `<${makeReference()}@demo.synopse.local>`,
            receivedAt: createdAt,
          },
        },
        activities: {
          create: {
            action: "DEMO_ALERT_GENERATED",
            actor: "scheduler",
            details: { source: "hourly-generator" },
          },
        },
      },
    });

    created.push({ id: alert.reference, subject: alert.subject, priority: alert.priority, status: alert.status });
  }

  return created;
}