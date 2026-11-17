CREATE TABLE "inquiry_email_config" (
  "id" TEXT PRIMARY KEY DEFAULT 'owner' CHECK ("id" = 'owner'),
  "userId" TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "encryptedRefreshToken" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT false,
  "initializedAt" TIMESTAMP(3), "connectedAt" TIMESTAMP(3), "lastCheckedAt" TIMESTAMP(3),
  "lastSentAt" TIMESTAMP(3), "lastErrorCode" TEXT,
  "oauthStateHash" TEXT, "oauthExpiresAt" TIMESTAMP(3), "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3)
);
CREATE TABLE "inquiry_email_deliveries" (
  "configId" TEXT NOT NULL REFERENCES "inquiry_email_config"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "itemKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('baseline','pending','sending','sent','uncertain','failed')),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "attemptToken" TEXT, "attemptedAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3), "gmailMessageId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("configId", "itemKey")
);
CREATE INDEX "inquiry_email_deliveries_configId_status_nextAttemptAt_idx"
  ON "inquiry_email_deliveries"("configId", "status", "nextAttemptAt");
ALTER TABLE "inquiry_email_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inquiry_email_deliveries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "inquiry_email_config", "inquiry_email_deliveries" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON "inquiry_email_config", "inquiry_email_deliveries" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON "inquiry_email_config", "inquiry_email_deliveries" FROM authenticated;
  END IF;
END $$;
