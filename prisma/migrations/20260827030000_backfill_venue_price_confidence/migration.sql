-- 이미 적재된 3,721건의 요금 신뢰도·4시간 환산액을 raw 에서 채운다.
-- 값은 원본 CSV 에 처음부터 있었고 raw 에 그대로 담겨 있다. 3,721건을 다시 적재하는 것보다
-- 여기서 옮기는 편이 빠르고, 사람이 전화로 채운 칸(calledAt 등)을 건드릴 위험도 없다.
--
-- 숫자가 아닌 값이 섞여 있어 정규식으로 거른다. NULLIF 만으로는 ''::int 에서 터진다.
UPDATE "venues"
   SET "price4h" = CASE
         WHEN raw->>'대관료_4시간환산' ~ '^[0-9]+$'
              AND length(raw->>'대관료_4시간환산') <= 9
         THEN (raw->>'대관료_4시간환산')::int
       END,
       "priceConfidence" = NULLIF(TRIM(COALESCE(raw->>'요금_신뢰도', '')), ''),
       "priceMin" = CASE
         WHEN raw->>'대관료_최소' ~ '^[0-9]+$' AND length(raw->>'대관료_최소') <= 9
         THEN (raw->>'대관료_최소')::int
       END,
       "priceMax" = CASE
         WHEN raw->>'대관료_최대' ~ '^[0-9]+$' AND length(raw->>'대관료_최대') <= 9
         THEN (raw->>'대관료_최대')::int
       END
 WHERE raw ?| array['대관료_4시간환산', '요금_신뢰도', '대관료_최소', '대관료_최대'];
