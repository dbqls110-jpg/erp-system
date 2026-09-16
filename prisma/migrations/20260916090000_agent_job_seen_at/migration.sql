-- 비서 대화에 읽음 표시를 붙인다.
-- 비서가 먼저 보내는 알림(가입 신청 등)은 직원 DM 과 달리 안 읽음 배지에 잡히지 않았다.
ALTER TABLE "agent_jobs" ADD COLUMN "seenAt" TIMESTAMP(3);

-- 지금까지 끝난 대화는 이미 본 것으로 친다. 안 그러면 배포 직후 옛 답변 수십 건이 한꺼번에 배지로 뜬다.
-- 단, 비서 알림([알림])은 아직 안 본 것이므로 남긴다.
UPDATE "agent_jobs"
SET "seenAt" = COALESCE("completedAt", "updatedAt")
WHERE "status" IN ('completed', 'error') AND "input" <> '[알림]';

CREATE INDEX "agent_jobs_userId_visibility_seenAt_idx" ON "agent_jobs"("userId", "visibility", "seenAt");
