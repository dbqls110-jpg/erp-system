-- 파트너의 작업 항목별 단가.
--
-- 단가를 한 값으로만 두면 디자이너처럼 일마다 값이 다른 사람을 담을 수 없다.
-- 포스터 50만, 리플렛 30만, 리사이징 5만이 전부 다른 단가다.
--
-- partners.rate 는 대표 단가로 남겨 둔다. 항목이 하나뿐인 파트너에게 표를 하나 더
-- 열게 하는 것은 번거롭고, 목록에서 한눈에 볼 값도 필요하다.

CREATE TABLE IF NOT EXISTS "partner_rates" (
    "id"        TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "item"      TEXT NOT NULL,
    "amount"    INTEGER NOT NULL,
    "unit"      TEXT NOT NULL DEFAULT '건당',
    "memo"      TEXT,
    "order"     INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "partner_rates_pkey" PRIMARY KEY ("id")
);

-- 같은 파트너에게 같은 항목이 두 번 생기면 어느 쪽이 맞는지 알 수 없다.
CREATE UNIQUE INDEX IF NOT EXISTS "partner_rates_partnerId_item_key" ON "partner_rates"("partnerId", "item");
CREATE INDEX IF NOT EXISTS "partner_rates_partnerId_idx" ON "partner_rates"("partnerId");

-- 파트너를 지우면 단가도 같이 지운다. 남겨 봐야 주인 없는 값이다.
ALTER TABLE "partner_rates"
  DROP CONSTRAINT IF EXISTS "partner_rates_partnerId_fkey";
ALTER TABLE "partner_rates"
  ADD CONSTRAINT "partner_rates_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 이미 대표 단가를 적어 둔 파트너는 그 값을 첫 항목으로 옮겨 둔다.
-- 0 은 단가가 아니라 안 적은 것이므로 제외한다.
INSERT INTO "partner_rates" ("id", "partnerId", "item", "amount", "unit", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", '기본', "rate", COALESCE("rateUnit", '건당'), 0, NOW(), NOW()
FROM "partners"
WHERE "rate" IS NOT NULL AND "rate" > 0
ON CONFLICT ("partnerId", "item") DO NOTHING;

-- 0 으로 저장된 대표 단가를 지운다. 목록에 "0원 / 건당" 이라고 떠서
-- 단가를 아는 것처럼 보였다.
UPDATE "partners" SET "rate" = NULL WHERE "rate" = 0;
