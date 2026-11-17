CREATE TABLE "inbox_mailboxes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "provider" TEXT NOT NULL CHECK ("provider" IN ('gmail', 'naver')),
  "email" TEXT NOT NULL,
  "folder" TEXT NOT NULL,
  "encryptedCredential" TEXT NOT NULL,
  "lastSyncedAt" TIMESTAMP(3), "lastErrorCode" TEXT,
  "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("ownerId", "provider", "email")
);
CREATE TABLE "inbox_mail" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "mailboxId" TEXT NOT NULL REFERENCES "inbox_mailboxes"("id") ON DELETE CASCADE,
  "providerMessageId" TEXT NOT NULL, "subject" TEXT NOT NULL,
  "senderName" TEXT NOT NULL, "senderEmail" TEXT NOT NULL,
  "body" TEXT NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("mailboxId", "providerMessageId")
);
CREATE INDEX "inbox_mail_mailboxId_receivedAt_idx" ON "inbox_mail"("mailboxId", "receivedAt");
CREATE TABLE "inbox_oauth_attempts" (
  "stateHash" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "folder" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "inbox_oauth_attempts_expiresAt_idx" ON "inbox_oauth_attempts"("expiresAt");
CREATE TABLE "inbox_follow_ups" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "itemKey" TEXT NOT NULL, "dueAt" TIMESTAMP(3),
  "note" TEXT NOT NULL DEFAULT '', "version" INTEGER NOT NULL DEFAULT 1,
  UNIQUE ("ownerId", "itemKey")
);
ALTER TABLE "inbox_mailboxes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inbox_mail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inbox_oauth_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inbox_follow_ups" ENABLE ROW LEVEL SECURITY;
