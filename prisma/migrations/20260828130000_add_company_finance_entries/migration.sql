-- 프로젝트 금액과 분리해 직접 입력하는 회사 매출·매입 장부
CREATE TABLE IF NOT EXISTS "company_finance_entries" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "memo" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_finance_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "company_finance_entries_company_date_idx"
  ON "company_finance_entries"("company", "date");
CREATE INDEX IF NOT EXISTS "company_finance_entries_date_idx"
  ON "company_finance_entries"("date");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_finance_entries_createdById_fkey'
  ) THEN
    ALTER TABLE "company_finance_entries"
      ADD CONSTRAINT "company_finance_entries_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- 회사 매출·매입을 등록할 수 있는 권한을 팀장 이상에게 부여한다.
UPDATE "menu_access"
SET "canEdit" = true
WHERE "menuKey" = 'companyFinance' AND "levelKey" IN ('admin', 'manager');
