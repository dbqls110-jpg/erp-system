-- 프로젝트 매출·매입을 여러 건 담는다.
-- 행사 하나에 추가 매출·추가 매입이 붙는 일이 잦아 한 쌍으로는 담기지 않는다.
CREATE TABLE "project_amounts" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "label" TEXT,
  "memo" TEXT,
  "sourceFileName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_amounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_amounts_projectId_kind_idx" ON "project_amounts"("projectId", "kind");

ALTER TABLE "project_amounts" ADD CONSTRAINT "project_amounts_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 이미 들어 있는 매출·매입을 "기본" 한 건으로 옮긴다.
-- 0 은 실제 금액이 아니라 채우다 만 값이라 건너뛴다. 건을 만들면 목록만 지저분해진다.
INSERT INTO "project_amounts" ("id", "projectId", "kind", "amount", "label", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", 'revenue', p."revenue", '기본', NOW(), NOW()
FROM "projects" p WHERE p."revenue" IS NOT NULL AND p."revenue" <> 0;

INSERT INTO "project_amounts" ("id", "projectId", "kind", "amount", "label", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", 'cost', p."cost", '기본', NOW(), NOW()
FROM "projects" p WHERE p."cost" IS NOT NULL AND p."cost" <> 0;
