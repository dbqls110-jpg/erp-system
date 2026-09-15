-- 고정비에 적용 기간을 붙인다.
-- 9월 화면에서 고치면 7·8월까지 같이 바뀌던 문제. 행 하나가 모든 달에 적용됐기 때문이다.
ALTER TABLE "fixed_expenses" ADD COLUMN "startMonth" TEXT;
ALTER TABLE "fixed_expenses" ADD COLUMN "endMonth" TEXT;

-- 기존 행은 처음 입력한 달부터 적용된 것으로 본다. 6월에 넣은 건 6월부터, 9월에 넣은
-- 건 9월부터. 전부 한 달로 몰면 9월에 넣은 것이 7·8월 장부에 끼어든다.
-- 한국 시간 기준으로 달을 잡는다. UTC 로 자르면 말일 밤에 넣은 것이 전달로 밀린다.
UPDATE "fixed_expenses"
SET "startMonth" = to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')
WHERE "startMonth" IS NULL;

ALTER TABLE "fixed_expenses" ALTER COLUMN "startMonth" SET NOT NULL;
CREATE INDEX "fixed_expenses_startMonth_endMonth_idx" ON "fixed_expenses"("startMonth", "endMonth");
