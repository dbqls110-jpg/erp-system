CREATE TABLE "party_quotes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "customerId" TEXT REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "partnerId" TEXT REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "size" INTEGER NOT NULL,
  "contentSha256" TEXT NOT NULL, "driveFileId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3),
  "createdById" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "party_quotes_one_owner" CHECK (("customerId" IS NOT NULL)::int + ("partnerId" IS NOT NULL)::int = 1),
  CONSTRAINT "party_quotes_status" CHECK ("status" IN ('pending','ready','needs_attention')),
  CONSTRAINT "party_quotes_size" CHECK ("size" > 0 AND "size" <= 10485760)
);
CREATE UNIQUE INDEX "party_quotes_driveFileId_key" ON "party_quotes"("driveFileId");
CREATE UNIQUE INDEX "party_quotes_customerId_contentSha256_key" ON "party_quotes"("customerId","contentSha256");
CREATE UNIQUE INDEX "party_quotes_partnerId_contentSha256_key" ON "party_quotes"("partnerId","contentSha256");
CREATE INDEX "party_quotes_customerId_createdAt_idx" ON "party_quotes"("customerId","createdAt");
CREATE INDEX "party_quotes_partnerId_createdAt_idx" ON "party_quotes"("partnerId","createdAt");
CREATE TABLE "inquiry_read_receipts" (
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "itemKey" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId","itemKey")
);
ALTER TABLE "party_quotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inquiry_read_receipts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "party_quotes", "inquiry_read_receipts" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON TABLE "party_quotes", "inquiry_read_receipts" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON TABLE "party_quotes", "inquiry_read_receipts" FROM authenticated;
  END IF;
END $$;
