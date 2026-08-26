-- 공간 요금의 신뢰도와 4시간 환산액을 담을 칸.
-- price 하나로는 비교가 안 된다. 같은 "2,000원" 이 30분 요금이기도 하고 1일 요금이기도 해서,
-- 검증이 덜 된 행이 오히려 싸 보여 목록 맨 위로 올라오는 일이 있었다.
ALTER TABLE "venues" ADD COLUMN "price4h" INTEGER;
ALTER TABLE "venues" ADD COLUMN "priceConfidence" TEXT;
ALTER TABLE "venues" ADD COLUMN "priceMin" INTEGER;
ALTER TABLE "venues" ADD COLUMN "priceMax" INTEGER;

-- 파트너에게 실제로 지급한 건. 등록 단가와 별개다.
CREATE TABLE "partner_payments" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "projectId" TEXT,
    "item" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '건당',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "paidOn" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "partner_payments_partnerId_item_idx" ON "partner_payments"("partnerId", "item");
CREATE INDEX "partner_payments_projectId_idx" ON "partner_payments"("projectId");

-- 파트너를 지우면 그 사람 지급 이력도 함께 지운다.
ALTER TABLE "partner_payments" ADD CONSTRAINT "partner_payments_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 프로젝트를 지워도 "얼마 줬다" 는 사실은 남아야 한다.
ALTER TABLE "partner_payments" ADD CONSTRAINT "partner_payments_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
