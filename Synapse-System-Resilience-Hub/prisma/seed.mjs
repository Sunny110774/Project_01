import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const demoAlerts = JSON.parse(await readFile(new URL("./demo-alerts.json", import.meta.url), "utf8"));
const prisma = new PrismaClient();
const statusRows = [
  { code: "OPEN", label: "Open", sortOrder: 1, isTerminal: false },
  { code: "IN_PROGRESS", label: "In progress", sortOrder: 2, isTerminal: false },
  { code: "RESOLVED", label: "Resolved", sortOrder: 3, isTerminal: true },
];
const severityRows = [
  { code: "P1", label: "Critical", slaMinutes: 30, sortOrder: 1 },
  { code: "P2", label: "High", slaMinutes: 60, sortOrder: 2 },
  { code: "P3", label: "Medium", slaMinutes: 240, sortOrder: 3 },
  { code: "P4", label: "Low", slaMinutes: 480, sortOrder: 4 },
];
const statusCode = {
  Open: "OPEN",
  "In progress": "IN_PROGRESS",
  Resolved: "RESOLVED",
};

function usernameForDisplayName(displayName) {
  const normalized = displayName.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "user";
  const suffix = createHash("md5").update(displayName).digest("hex").slice(0, 6);
  return `${normalized}.${suffix}`;
}

async function main() {
  for (const status of statusRows) {
    await prisma.alertStatus.upsert({
      where: { code: status.code },
      update: { label: status.label, sortOrder: status.sortOrder, isTerminal: status.isTerminal },
      create: status,
    });
  }

  for (const severity of severityRows) {
    await prisma.alertSeverity.upsert({
      where: { code: severity.code },
      update: { label: severity.label, slaMinutes: severity.slaMinutes, sortOrder: severity.sortOrder },
      create: severity,
    });
  }

  const seededUser = {
    username: usernameForDisplayName("Naveen Nigam"),
    displayName: "Naveen Nigam",
    email: "naveen.nkn1001@gmail.com",
    phoneNumber: "+91-9860742404",
    mfaEnabled: true,
  };

  await prisma.user.upsert({
    where: { username: seededUser.username },
    update: {
      displayName: seededUser.displayName,
      email: seededUser.email,
      phoneNumber: seededUser.phoneNumber,
      mfaEnabled: seededUser.mfaEnabled,
    },
    create: {
      ...seededUser,
      auditEntries: {
        create: {
          action: "USER_SEEDED_FOR_LOGIN",
          details: { source: "seed-user" },
        },
      },
    },
  });

  const assignedNames = [...new Set(demoAlerts.map((alert) => alert.assignee).filter((name) => name !== "Unassigned"))];
  for (const displayName of assignedNames) {
    const username = usernameForDisplayName(displayName);
    await prisma.user.upsert({
      where: { username },
      update: {},
      create: {
        username,
        displayName,
        auditEntries: {
          create: {
            action: "DEMO_USER_SEEDED",
            details: { source: "demo-alerts" },
          },
        },
      },
    });
  }

  for (const sample of demoAlerts) {
    const createdAt = new Date(Date.now() - sample.ageMinutes * 60_000);
    const currentStatus = statusCode[sample.status];
    const firstRespondedAt = currentStatus === "IN_PROGRESS" ? new Date(createdAt.getTime() + 5 * 60_000) : null;
    const closedAt = currentStatus === "RESOLVED" ? new Date(createdAt.getTime() + 15 * 60_000) : null;

    await prisma.alert.upsert({
      where: { reference: sample.id },
      update: {},
      create: {
        reference: sample.id,
        subject: sample.subject,
        sender: sample.source,
        location: sample.location,
        bodyText: sample.body,
        createdAt,
        firstRespondedAt,
        closedAt,
        ...(sample.assignee === "Unassigned" ? {} : {
          assignee: { connect: { username: usernameForDisplayName(sample.assignee) } },
        }),
        statusDefinition: { connect: { code: currentStatus } },
        severityDefinition: { connect: { code: sample.priority } },
        rawAlert: {
          create: {
            source: "DEMO",
            rawPayload: `From: ${sample.source}\nSubject: ${sample.subject}\n\n${sample.body}`,
            messageId: `<${sample.id.toLowerCase()}@demo.synopse.local>`,
            receivedAt: createdAt,
          },
        },
        statusAudits: {
          create: {
            status: { connect: { code: currentStatus } },
            actor: "demo-seed",
            note: "Initial status from the demo dataset.",
            changedAt: createdAt,
          },
        },
        severityAudits: {
          create: {
            severity: { connect: { code: sample.priority } },
            actor: "demo-seed",
            note: "Initial severity from the demo dataset.",
            changedAt: createdAt,
          },
        },
        activities: {
          create: {
            action: "DEMO_ALERT_SEEDED",
            actor: "demo-seed",
            details: { dataset: "demo-alerts" },
            createdAt,
          },
        },
      },
    });
  }

  console.log(`Seeded ${demoAlerts.length} demo alerts.`);
}

main()
  .catch((error) => {
    console.error("Demo alert seeding failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
