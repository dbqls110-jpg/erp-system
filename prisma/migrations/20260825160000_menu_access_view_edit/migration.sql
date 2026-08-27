-- 메뉴 권한을 "접근"과 "수정"으로 나누고, 조직 레벨 4단계를 심는다.
--
-- 이 마이그레이션은 한 트랜잭션에서 role 값 이관과 권한 시딩을 함께 처리한다.
-- 나눠서 적용하면 그 사이에 "레벨 규칙은 있는데 사용자 role 은 아직 옛 값"인
-- 구간이 생기고, 그 구간에서는 관리자를 뺀 전원이 모든 메뉴에서 잠긴다.

-- 1) 접근/수정 구분 컬럼. 기존 행은 전부 "접근 허용"이었으므로 canView 기본값이 true 다.
ALTER TABLE "menu_access" ADD COLUMN IF NOT EXISTS "canView" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "menu_access" ADD COLUMN IF NOT EXISTS "canEdit" BOOLEAN NOT NULL DEFAULT false;

-- 2) 조직 레벨 4단계. 이미 있으면 이름과 순서만 맞춘다(관리자가 이름을 바꿨을 수 있으나,
--    시스템 레벨은 코드가 key 로 참조하므로 순서는 정본을 따라야 한다).
INSERT INTO "access_levels" ("id", "name", "key", "rank", "isSystem", "createdAt", "updatedAt")
VALUES
  ('lvl_admin',   '관리자', 'admin',   100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lvl_manager', '팀장',   'manager',  60, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lvl_member',  '사원',   'member',   30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('lvl_partner', '파트너', 'partner',  10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
  SET "rank" = EXCLUDED."rank",
      "isSystem" = true,
      "updatedAt" = CURRENT_TIMESTAMP;

-- 3) 레벨 도입 전의 직원 role("user")을 사원으로 이관한다.
--    admin 과 pending 은 그대로 둔다.
UPDATE "users" SET "role" = 'member' WHERE "role" = 'user';

-- 4) 메뉴별 기본 권한. 관리자가 이미 손댄 설정은 덮지 않는다(ON CONFLICT DO NOTHING).
--    src/lib/menu-keys.ts 의 DEFAULT_MENU_RULES 와 같은 내용이어야 한다.
INSERT INTO "menu_access" ("id", "menuKey", "levelKey", "canView", "canEdit", "createdAt")
VALUES
  -- 대시보드 · 메신저: 전원. 둘 다 막으면 파트너 계정이 로그인 직후 갈 곳이 없다.
  ('ma_dashboard_admin',   'dashboard',   'admin',   true, false, CURRENT_TIMESTAMP),
  ('ma_dashboard_manager', 'dashboard',   'manager', true, false, CURRENT_TIMESTAMP),
  ('ma_dashboard_member',  'dashboard',   'member',  true, false, CURRENT_TIMESTAMP),
  ('ma_dashboard_partner', 'dashboard',   'partner', true, false, CURRENT_TIMESTAMP),

  ('ma_messenger_admin',   'messenger',   'admin',   true, true,  CURRENT_TIMESTAMP),
  ('ma_messenger_manager', 'messenger',   'manager', true, true,  CURRENT_TIMESTAMP),
  ('ma_messenger_member',  'messenger',   'member',  true, true,  CURRENT_TIMESTAMP),
  ('ma_messenger_partner', 'messenger',   'partner', true, true,  CURRENT_TIMESTAMP),

  -- 근태 · 휴가: 사원 이상 접근, 수정(남의 기록 손대기)은 관리자만.
  -- 본인 출퇴근 찍기와 휴가 신청은 여기서 막는 대상이 아니다.
  ('ma_attendance_admin',   'attendance', 'admin',   true, true,  CURRENT_TIMESTAMP),
  ('ma_attendance_manager', 'attendance', 'manager', true, false, CURRENT_TIMESTAMP),
  ('ma_attendance_member',  'attendance', 'member',  true, false, CURRENT_TIMESTAMP),

  ('ma_leave_admin',   'leave', 'admin',   true, true,  CURRENT_TIMESTAMP),
  ('ma_leave_manager', 'leave', 'manager', true, false, CURRENT_TIMESTAMP),
  ('ma_leave_member',  'leave', 'member',  true, false, CURRENT_TIMESTAMP),

  -- 프로젝트 · 캘린더: 팀장 이상.
  ('ma_projects_admin',   'projects', 'admin',   true, true, CURRENT_TIMESTAMP),
  ('ma_projects_manager', 'projects', 'manager', true, true, CURRENT_TIMESTAMP),

  ('ma_calendar_admin',   'calendar', 'admin',   true, true, CURRENT_TIMESTAMP),
  ('ma_calendar_manager', 'calendar', 'manager', true, true, CURRENT_TIMESTAMP),

  -- 거래처 · 파트너 · 공간 DB: 사원 이상 접근, 팀장 이상 수정.
  ('ma_customers_admin',   'customers', 'admin',   true, true,  CURRENT_TIMESTAMP),
  ('ma_customers_manager', 'customers', 'manager', true, true,  CURRENT_TIMESTAMP),
  ('ma_customers_member',  'customers', 'member',  true, false, CURRENT_TIMESTAMP),

  ('ma_partners_admin',   'partners', 'admin',   true, true,  CURRENT_TIMESTAMP),
  ('ma_partners_manager', 'partners', 'manager', true, true,  CURRENT_TIMESTAMP),
  ('ma_partners_member',  'partners', 'member',  true, false, CURRENT_TIMESTAMP),

  ('ma_venues_admin',   'venues', 'admin',   true, true,  CURRENT_TIMESTAMP),
  ('ma_venues_manager', 'venues', 'manager', true, true,  CURRENT_TIMESTAMP),
  ('ma_venues_member',  'venues', 'member',  true, false, CURRENT_TIMESTAMP),

  -- 재무 관리: 팀장 이상 접근, 관리자만 수정.
  ('ma_finance_admin',   'finance', 'admin',   true, true,  CURRENT_TIMESTAMP),
  ('ma_finance_manager', 'finance', 'manager', true, false, CURRENT_TIMESTAMP),

  -- 구글 시트 · ID 관리: 팀장 이상 접근 및 수정.
  ('ma_sheets_admin',   'sheets', 'admin',   true, true, CURRENT_TIMESTAMP),
  ('ma_sheets_manager', 'sheets', 'manager', true, true, CURRENT_TIMESTAMP),

  ('ma_credentials_admin',   'credentials', 'admin',   true, true, CURRENT_TIMESTAMP),
  ('ma_credentials_manager', 'credentials', 'manager', true, true, CURRENT_TIMESTAMP),

  -- 관리자 메뉴: 관리자 전용.
  ('ma_admin_admin', 'admin', 'admin', true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("menuKey", "levelKey") DO NOTHING;
