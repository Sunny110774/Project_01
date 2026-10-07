ALTER TYPE "AlertStatus" RENAME TO "AlertStatusCode";
CREATE TYPE "AlertSource" AS ENUM ('EMAIL', 'MANUAL', 'DEMO');

CREATE TABLE "Synopse_AlertStatus" (
    "code" "AlertStatusCode" NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Synopse_AlertStatus_pkey" PRIMARY KEY ("code")
);

INSERT INTO "Synopse_AlertStatus" ("code", "label", "sortOrder", "isTerminal") VALUES
    ('OPEN', 'Open', 1, false),
    ('IN_PROGRESS', 'In progress', 2, false),
    ('RESOLVED', 'Resolved', 3, true);

CREATE TABLE "Synopse_AlertSeverity" (
    "code" "Priority" NOT NULL,
    "label" TEXT NOT NULL,
    "slaMinutes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "Synopse_AlertSeverity_pkey" PRIMARY KEY ("code")
);

INSERT INTO "Synopse_AlertSeverity" ("code", "label", "slaMinutes", "sortOrder") VALUES
    ('P1', 'Critical', 30, 1),
    ('P2', 'High', 60, 2),
    ('P3', 'Medium', 240, 3),
    ('P4', 'Low', 480, 4);

ALTER TABLE "Alert" RENAME TO "Synopse_AlertDetails";
ALTER INDEX "Alert_reference_key" RENAME TO "Synopse_AlertDetails_reference_key";
ALTER INDEX "Alert_priority_status_createdAt_idx" RENAME TO "Synopse_AlertDetails_priority_status_createdAt_idx";
ALTER INDEX "Alert_assignedTo_status_idx" RENAME TO "Synopse_AlertDetails_assignedTo_status_idx";
ALTER INDEX "Alert_createdAt_status_idx" RENAME TO "Synopse_AlertDetails_createdAt_status_idx";

CREATE TABLE "Synopse_RawAlerts" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "source" "AlertSource" NOT NULL DEFAULT 'EMAIL',
    "rawPayload" TEXT NOT NULL,
    "messageId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Synopse_RawAlerts_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Synopse_RawAlerts" ("id", "alertId", "source", "rawPayload", "messageId", "receivedAt")
SELECT
    "id",
    "id",
    CASE WHEN "sender" = 'manual intake' THEN 'MANUAL'::"AlertSource" ELSE 'EMAIL'::"AlertSource" END,
    "rawEmail",
    "messageId",
    "createdAt"
FROM "Synopse_AlertDetails";

CREATE TABLE "Synopse_AlertStatusAudit" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "statusCode" "AlertStatusCode" NOT NULL,
    "actor" TEXT,
    "note" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Synopse_AlertStatusAudit_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Synopse_AlertStatusAudit" ("id", "alertId", "statusCode", "note", "changedAt")
SELECT md5("id" || ':initial-status'), "id", "status", 'Initial status carried forward by normalization migration.', "createdAt"
FROM "Synopse_AlertDetails";

CREATE TABLE "Synopse_AlertSeverityAudit" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "severityCode" "Priority" NOT NULL,
    "actor" TEXT,
    "note" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Synopse_AlertSeverityAudit_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Synopse_AlertSeverityAudit" ("id", "alertId", "severityCode", "note", "changedAt")
SELECT md5("id" || ':initial-severity'), "id", "priority", 'Initial severity carried forward by normalization migration.', "createdAt"
FROM "Synopse_AlertDetails";

ALTER TABLE "Synopse_AlertDetails"
    DROP COLUMN "rawEmail",
    DROP COLUMN "messageId",
    DROP COLUMN "slaMinutes";

CREATE UNIQUE INDEX "Synopse_AlertStatus_label_key" ON "Synopse_AlertStatus"("label");
CREATE UNIQUE INDEX "Synopse_AlertStatus_sortOrder_key" ON "Synopse_AlertStatus"("sortOrder");
CREATE UNIQUE INDEX "Synopse_AlertSeverity_label_key" ON "Synopse_AlertSeverity"("label");
CREATE UNIQUE INDEX "Synopse_AlertSeverity_sortOrder_key" ON "Synopse_AlertSeverity"("sortOrder");
CREATE UNIQUE INDEX "Synopse_RawAlerts_alertId_key" ON "Synopse_RawAlerts"("alertId");
CREATE UNIQUE INDEX "Synopse_RawAlerts_messageId_key" ON "Synopse_RawAlerts"("messageId");
CREATE INDEX "Synopse_RawAlerts_source_receivedAt_idx" ON "Synopse_RawAlerts"("source", "receivedAt");
CREATE INDEX "Synopse_AlertStatusAudit_alertId_changedAt_idx" ON "Synopse_AlertStatusAudit"("alertId", "changedAt");
CREATE INDEX "Synopse_AlertSeverityAudit_alertId_changedAt_idx" ON "Synopse_AlertSeverityAudit"("alertId", "changedAt");

ALTER TABLE "Synopse_AlertDetails"
    ADD CONSTRAINT "Synopse_AlertDetails_status_fkey" FOREIGN KEY ("status") REFERENCES "Synopse_AlertStatus"("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Synopse_AlertDetails_priority_fkey" FOREIGN KEY ("priority") REFERENCES "Synopse_AlertSeverity"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Synopse_RawAlerts"
    ADD CONSTRAINT "Synopse_RawAlerts_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Synopse_AlertDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Synopse_AlertStatusAudit"
    ADD CONSTRAINT "Synopse_AlertStatusAudit_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Synopse_AlertDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "Synopse_AlertStatusAudit_statusCode_fkey" FOREIGN KEY ("statusCode") REFERENCES "Synopse_AlertStatus"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Synopse_AlertSeverityAudit"
    ADD CONSTRAINT "Synopse_AlertSeverityAudit_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Synopse_AlertDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "Synopse_AlertSeverityAudit_severityCode_fkey" FOREIGN KEY ("severityCode") REFERENCES "Synopse_AlertSeverity"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
