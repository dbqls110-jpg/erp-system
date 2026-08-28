-- Keep historical evaluation/connection fixtures available for internal audits,
-- but prevent them from appearing in the user-facing ERP assistant history.
UPDATE "agent_jobs"
SET "visibility" = 'internal'
WHERE "visibility" = 'user'
  AND POSITION('[ERP AI 평가' IN COALESCE("userInput", "input")) > 0;

UPDATE "agent_jobs"
SET "visibility" = 'internal'
WHERE "visibility" = 'user'
  AND (
    POSITION('[배포 검증]' IN COALESCE("userInput", "input")) > 0
    OR POSITION('연결 시험이다.' IN COALESCE("userInput", "input")) > 0
    OR POSITION('연결 확인 테스트입니다.' IN COALESCE("userInput", "input")) > 0
  );
