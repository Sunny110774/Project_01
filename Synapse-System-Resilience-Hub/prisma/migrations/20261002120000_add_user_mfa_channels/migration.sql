ALTER TABLE "Synopse_Users"
    ADD COLUMN "phoneNumber" TEXT,
    ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "lastMfaCode" TEXT,
    ADD COLUMN "mfaCodeExpiresAt" TIMESTAMP(3),
    ADD COLUMN "lastLoginAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Synopse_Users_phoneNumber_key" ON "Synopse_Users"("phoneNumber");