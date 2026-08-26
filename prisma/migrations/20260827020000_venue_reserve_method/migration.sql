-- 신청 방법. 예약 URL 이 있어도 실제로는 전화로만 받는 곳이 절반이 넘는다.
-- 목록에 "예약" 링크만 걸어 두면 눌러 봐야 예약이 안 되는 안내 페이지가 열린다.
ALTER TABLE "venues" ADD COLUMN "reserveMethod" TEXT;

-- 이미 적재된 3,721건은 raw 에 값이 들어 있다. 다시 적재하지 않고 여기서 채운다.
UPDATE "venues"
   SET "reserveMethod" = NULLIF(TRIM(raw->>'대관방법_표준'), '')
 WHERE raw ? '대관방법_표준';
