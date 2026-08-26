-- 파트너에 단가를 넣고 상태 값의 뜻을 바꾼다.
--
-- 계약상태(진행중/만료/대기)는 회사와 계약을 맺는 관계를 전제한 값이라 건별로
-- 부르는 프리랜서에는 맞지 않았다. "만료"보다 "요즘도 같이 일하나"가 실제로
-- 궁금한 것이다. 컬럼 이름은 그대로 두고 값의 뜻만 바꾼다 — 이름까지 바꾸면
-- 코드 여러 곳을 함께 고쳐야 하는데 얻는 것이 없다.
--
-- 단가는 금액과 단위를 나눈다. "50만원/건" 을 문자열 하나로 넣으면 "40만원 이하
-- 사진작가" 같은 조건으로 찾을 수 없다.

ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "rate" INTEGER;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "rateUnit" TEXT;

-- 기존 행의 상태 값을 새 뜻으로 옮긴다. 지금은 0건이지만, 나중에 이 마이그레이션이
-- 자료가 있는 환경에서 돌 수도 있다.
UPDATE "partners" SET "contractStatus" = '활성' WHERE "contractStatus" = '진행중';
UPDATE "partners" SET "contractStatus" = '보류' WHERE "contractStatus" = '대기';
UPDATE "partners" SET "contractStatus" = '종료' WHERE "contractStatus" = '만료';

ALTER TABLE "partners" ALTER COLUMN "contractStatus" SET DEFAULT '활성';
