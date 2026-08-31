-- 프로젝트별 매출·매입을 어느 법인에 귀속할지 저장한다.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "company" TEXT;

-- 회사 매출·매입 통합 화면을 팀장 이상에게 기본 공개한다.
INSERT INTO "menu_access" ("id", "menuKey", "levelKey", "canView", "canEdit", "createdAt")
VALUES
  ('ma_company_finance_admin',   'companyFinance', 'admin',   true, true,  CURRENT_TIMESTAMP),
  ('ma_company_finance_manager', 'companyFinance', 'manager', true, false, CURRENT_TIMESTAMP)
ON CONFLICT ("menuKey", "levelKey") DO NOTHING;
