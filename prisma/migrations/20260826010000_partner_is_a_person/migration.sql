-- 파트너를 회사가 아니라 개인으로 다룬다.
--
-- 프리랜서·외주 인력을 이름 단위로 관리하므로 "담당자"라는 개념이 없다.
-- 이름 자체가 그 사람이다. 대신 어떤 일을 하는 사람인지(직업)가 필요하다.
--
-- 이 표는 현재 0건이라 컬럼을 지워도 잃을 자료가 없다. 자료가 쌓인 뒤였다면
-- manager 를 job 으로 옮기는 단계를 먼저 뒀어야 한다.

ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "job" TEXT;
ALTER TABLE "partners" DROP COLUMN IF EXISTS "manager";
