CREATE TABLE "dot_reports" (
  "id" TEXT PRIMARY KEY,
  "reportKey" TEXT NOT NULL UNIQUE,
  "runId" TEXT NOT NULL UNIQUE,
  "date" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('daily', 'audit')),
  "bodyHash" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "messageId" TEXT NOT NULL UNIQUE REFERENCES "messages"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "dot_reports_date_idx" ON "dot_reports"("date");

-- No real mailbox, OAuth account, secret, or administrator privileges are created.
INSERT INTO "users" ("id", "email", "name", "role", "active", "isAgent", "agentType", "createdAt", "updatedAt")
VALUES ('erp-dot-assistant', 'dot@agents.erp.invalid', 'DOT 업무비서', 'dot', true, true, 'dot', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
