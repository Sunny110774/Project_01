CREATE TYPE "Priority" AS ENUM ('P1', 'P2', 'P3', 'P4');
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');
CREATE TYPE "KnowledgeProvider" AS ENUM ('SHAREPOINT', 'JIRA', 'CONFLUENCE');

CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "recipient" TEXT,
    "location" TEXT,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "rawEmail" TEXT NOT NULL,
    "messageId" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'P3',
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "slaMinutes" INTEGER NOT NULL DEFAULT 240,
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstRespondedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeSource" (
    "id" TEXT NOT NULL,
    "provider" "KnowledgeProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "siteUrl" TEXT,
    "externalId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "content" TEXT NOT NULL,
    "contentHash" TEXT,
    "lastIndexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Alert_reference_key" ON "Alert"("reference");
CREATE UNIQUE INDEX "Alert_messageId_key" ON "Alert"("messageId");
CREATE INDEX "Alert_priority_status_createdAt_idx" ON "Alert"("priority", "status", "createdAt");
CREATE INDEX "Alert_assignedTo_status_idx" ON "Alert"("assignedTo", "status");
CREATE INDEX "Alert_createdAt_status_idx" ON "Alert"("createdAt", "status");
CREATE INDEX "ActivityEvent_alertId_createdAt_idx" ON "ActivityEvent"("alertId", "createdAt");
CREATE INDEX "KnowledgeSource_provider_externalId_idx" ON "KnowledgeSource"("provider", "externalId");
CREATE INDEX "KnowledgeSource_provider_enabled_idx" ON "KnowledgeSource"("provider", "enabled");
CREATE UNIQUE INDEX "KnowledgeDocument_sourceId_externalId_key" ON "KnowledgeDocument"("sourceId", "externalId");
CREATE INDEX "KnowledgeDocument_sourceId_lastIndexedAt_idx" ON "KnowledgeDocument"("sourceId", "lastIndexedAt");

ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
