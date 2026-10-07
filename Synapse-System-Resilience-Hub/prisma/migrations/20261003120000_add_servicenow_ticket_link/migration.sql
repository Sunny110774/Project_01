ALTER TABLE "Synopse_AlertDetails"
    ADD COLUMN "serviceNowSysId" TEXT,
    ADD COLUMN "serviceNowNumber" TEXT,
    ADD COLUMN "serviceNowUrl" TEXT;

CREATE UNIQUE INDEX "Synopse_AlertDetails_serviceNowSysId_key"
    ON "Synopse_AlertDetails"("serviceNowSysId");