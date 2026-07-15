-- Migration: 20260715000000_add_agent_realtime
-- 추가형 migration (기존 테이블 수정/삭제 없음)
-- 포함 내용:
--   1. users.agentType 컬럼 (db push로 먼저 배포됐을 수 있으므로 IF NOT EXISTS 패턴)
--   2. agent_message_processing 테이블
--   3. agent_memories 테이블
--   4. business_cards 테이블
--   5. agent_jobs 테이블 (실시간 작업 큐)
--   6. agent_job_deltas 테이블 (스트리밍 델타)
--   7. agent_bridge_heartbeats 테이블 (브릿지 상태)

-- ─── 1. users.agentType 컬럼 ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'agentType'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "agentType" TEXT;
  END IF;
END $$;

-- ─── 2. agent_message_processing ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "agent_message_processing" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processed',
    "processedAt" TIMESTAMP(3),
    "resultMessageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_message_processing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_message_processing_messageId_agentType_key"
    ON "agent_message_processing"("messageId", "agentType");
CREATE INDEX IF NOT EXISTS "agent_message_processing_agentType_createdAt_idx"
    ON "agent_message_processing"("agentType", "createdAt");

-- ─── 3. agent_memories ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "agent_memories" (
    "id" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_memories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_memories_agentType_createdAt_idx"
    ON "agent_memories"("agentType", "createdAt");

-- ─── 4. business_cards ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "business_cards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "jobTitle" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "imagePath" TEXT,
    "rawOcrText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_cards_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'business_cards_userId_fkey'
  ) THEN
    ALTER TABLE "business_cards"
      ADD CONSTRAINT "business_cards_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- ─── 5. agent_jobs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "agent_jobs" (
    "id" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "input" TEXT NOT NULL,
    "output" TEXT,
    "errorMsg" TEXT,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_jobs_agentType_status_createdAt_idx"
    ON "agent_jobs"("agentType", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "agent_jobs_userId_createdAt_idx"
    ON "agent_jobs"("userId", "createdAt");

-- ─── 6. agent_job_deltas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "agent_job_deltas" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_job_deltas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_job_deltas_jobId_seq_key"
    ON "agent_job_deltas"("jobId", "seq");
CREATE INDEX IF NOT EXISTS "agent_job_deltas_jobId_seq_idx"
    ON "agent_job_deltas"("jobId", "seq");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'agent_job_deltas_jobId_fkey'
  ) THEN
    ALTER TABLE "agent_job_deltas"
      ADD CONSTRAINT "agent_job_deltas_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "agent_jobs"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- ─── 7. agent_bridge_heartbeats ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "agent_bridge_heartbeats" (
    "id" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" TEXT,
    "hostname" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_bridge_heartbeats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_bridge_heartbeats_agentType_key"
    ON "agent_bridge_heartbeats"("agentType");
