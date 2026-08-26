-- 파트너 · 거래처가 자기 프로젝트 일정만 보게 한다.
--
-- 두 가지가 없어서 지금까지는 가릴 방법이 없었다.
--   1) 파트너 · 거래처에게 로그인 계정이 없었다. 표의 자료일 뿐이었다.
--   2) 일정이 아무것과도 연결돼 있지 않았다. 만든 사람만 있었다.
--
-- users.partnerId / customerId 로 "이 계정은 누구인지" 를 잇고,
-- calendar_events.projectId 로 "이 일정은 어느 프로젝트인지" 를 잇는다.
-- 그 프로젝트에 연결된 파트너 · 거래처만 그 일정을 본다.
--
-- projectId 가 비면 내부 일정이라 직원만 본다. 기본을 "공개"로 두지 않은 것이
-- 중요하다 — 실수로 비워 둔 일정이 거래처에 노출되는 것보다 안 보이는 편이 낫다.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "partnerId"  TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "customerId" TEXT;

CREATE INDEX IF NOT EXISTS "users_partnerId_idx"  ON "users"("partnerId");
CREATE INDEX IF NOT EXISTS "users_customerId_idx" ON "users"("customerId");

-- 파트너나 거래처를 지워도 계정은 남긴다. 계정을 함께 지우면 그 사람이 남긴
-- 근태 · 메시지까지 연쇄로 사라진다. 연결만 끊고 관리자가 다시 정하게 둔다.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_partnerId_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_customerId_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

CREATE INDEX IF NOT EXISTS "calendar_events_projectId_idx" ON "calendar_events"("projectId");
-- 캘린더는 달 단위로 조회한다. 날짜 인덱스가 없어 지금까지 전체를 훑고 있었다.
CREATE INDEX IF NOT EXISTS "calendar_events_date_idx" ON "calendar_events"("date");

-- 프로젝트를 지워도 일정은 남긴다. 지우면 그 날 무슨 일이 있었는지가 사라진다.
-- 연결만 끊기고 내부 일정이 된다.
ALTER TABLE "calendar_events" DROP CONSTRAINT IF EXISTS "calendar_events_projectId_fkey";
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
