-- VenueDA 외부 방문자 상담은 ERP 내부 User 계정이 없으므로 전용 테이블에 저장한다.
CREATE TABLE "venue_da_threads" (
    "id" TEXT NOT NULL,
    "externalThreadId" TEXT NOT NULL,
    "memberId" TEXT,
    "memberEmail" TEXT,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "context" JSONB,
    "assigneeId" TEXT,
    "summary" TEXT,
    "lastSyncError" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_da_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_da_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "clientMessageId" TEXT,
    "authorType" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "attachments" JSONB,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'received',
    "lastSyncError" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_da_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venue_da_threads_externalThreadId_key" ON "venue_da_threads"("externalThreadId");
CREATE INDEX "venue_da_threads_assigneeId_status_lastMessageAt_idx" ON "venue_da_threads"("assigneeId", "status", "lastMessageAt");
CREATE INDEX "venue_da_threads_memberEmail_idx" ON "venue_da_threads"("memberEmail");
CREATE UNIQUE INDEX "venue_da_messages_threadId_clientMessageId_key" ON "venue_da_messages"("threadId", "clientMessageId");
CREATE INDEX "venue_da_messages_threadId_createdAt_idx" ON "venue_da_messages"("threadId", "createdAt");
CREATE INDEX "venue_da_messages_threadId_authorType_readAt_idx" ON "venue_da_messages"("threadId", "authorType", "readAt");

ALTER TABLE "venue_da_threads"
    ADD CONSTRAINT "venue_da_threads_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "venue_da_messages"
    ADD CONSTRAINT "venue_da_messages_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "venue_da_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
