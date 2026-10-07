CREATE TABLE "Synopse_Users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Synopse_Users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SynopseUsersAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SynopseUsersAudit_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Synopse_Users" ("id", "username", "displayName", "isActive", "createdAt", "updatedAt")
SELECT
    md5('synopse-user:' || assigned."assignedTo"),
    COALESCE(NULLIF(trim(both '.' FROM lower(regexp_replace(assigned."assignedTo", '[^a-zA-Z0-9]+', '.', 'g'))), ''), 'user') || '.' || substring(md5(assigned."assignedTo") from 1 for 6),
    assigned."assignedTo",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "assignedTo" FROM "Synopse_AlertDetails" WHERE "assignedTo" IS NOT NULL) AS assigned;

INSERT INTO "SynopseUsersAudit" ("id", "userId", "action", "details")
SELECT
    md5('synopse-user-audit:' || users."displayName"),
    users."id",
    'USER_MIGRATED_FROM_ALERT_ASSIGNMENT',
    jsonb_build_object('source', 'existing alert assignment')
FROM "Synopse_Users" AS users;

ALTER TABLE "Synopse_AlertDetails" ADD COLUMN "assignedUserId" TEXT;

UPDATE "Synopse_AlertDetails" AS alerts
SET "assignedUserId" = users."id"
FROM "Synopse_Users" AS users
WHERE alerts."assignedTo" = users."displayName";

ALTER TABLE "Synopse_AlertDetails" DROP COLUMN "assignedTo";

CREATE UNIQUE INDEX "Synopse_Users_username_key" ON "Synopse_Users"("username");
CREATE UNIQUE INDEX "Synopse_Users_email_key" ON "Synopse_Users"("email");
CREATE INDEX "Synopse_AlertDetails_assignedUserId_status_idx" ON "Synopse_AlertDetails"("assignedUserId", "status");
CREATE INDEX "SynopseUsersAudit_userId_createdAt_idx" ON "SynopseUsersAudit"("userId", "createdAt");

ALTER TABLE "Synopse_AlertDetails"
    ADD CONSTRAINT "Synopse_AlertDetails_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "Synopse_Users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SynopseUsersAudit"
    ADD CONSTRAINT "SynopseUsersAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Synopse_Users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "SynopseUsersAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "Synopse_Users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
