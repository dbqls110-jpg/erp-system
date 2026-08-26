-- 사람이 실제로 친 말을 따로 담는다.
--
-- input 에는 지시문과 ERP 자료가 함께 들어 있어 화면에 그대로 못 보여준다.
-- 예전에는 "[질문]" 문자열로 잘라 꺼냈는데 지시문 문구가 바뀌면 조용히 깨지고,
-- 자료가 붙는 질문은 input 이 수십 KB 라 대화 목록을 부를 때마다 그 전부를 실어
-- 나르게 된다.

ALTER TABLE "agent_jobs" ADD COLUMN IF NOT EXISTS "userInput" TEXT;

-- 이미 쌓인 작업은 예전 방식대로 잘라 채운다. 한 번만 하면 된다.
UPDATE "agent_jobs"
SET "userInput" = TRIM(SUBSTRING("input" FROM POSITION('[질문]' IN "input") + 5))
WHERE "userInput" IS NULL AND POSITION('[질문]' IN "input") > 0;

-- 지시문 없이 통째로 질문이던 옛 작업은 input 을 그대로 쓴다.
UPDATE "agent_jobs" SET "userInput" = "input"
WHERE "userInput" IS NULL AND LENGTH("input") < 2000;
