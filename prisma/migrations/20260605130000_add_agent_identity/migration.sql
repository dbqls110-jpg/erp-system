-- AlterTable: User에 isAgent 필드 추가
ALTER TABLE "users" ADD COLUMN "isAgent" BOOLEAN NOT NULL DEFAULT false;

-- 기존 헤르메스 사용자를 Agent로 표시
-- HERMES_AGENT_EMAIL 환경변수에 다른 이메일을 설정한 경우 해당 이메일로 변경 필요
UPDATE "users" SET "isAgent" = true WHERE email = 'ybsw1220@gmail.com';
