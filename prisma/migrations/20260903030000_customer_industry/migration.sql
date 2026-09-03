-- 거래처 업종. category(고객사·협력사·공급사)는 우리와의 관계이지 그 회사가 하는 일이 아니다.
ALTER TABLE "customers" ADD COLUMN "industry" TEXT;

-- 같은 업종을 여러 이름으로 적어 두면 나중에 묶어 보기 어렵다. 목록 화면에서 자주 쓰는
-- 값을 추천하기 위해 조회하므로 인덱스를 둔다.
CREATE INDEX "customers_industry_idx" ON "customers"("industry");
