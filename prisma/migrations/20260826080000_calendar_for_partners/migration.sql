-- 파트너 레벨에 캘린더 접근을 연다.
--
-- 파트너·거래처 계정이 자기 프로젝트 일정을 보게 하려면 먼저 메뉴 자체에 들어올 수
-- 있어야 한다. 가시성 로직이 아무리 정확해도 requireMenuAccess 가 문 앞에서 막으면
-- 빈 화면조차 못 본다.
--
-- 수정 권한은 주지 않는다. 자기 프로젝트라도 일정을 바꾸게 두면 우리 쪽 기록이
-- 밖에서 바뀐다. calendarVisibility.canEditCalendar 도 같은 이유로 막는다 —
-- 두 겹으로 막아 두어야 한쪽을 고칠 때 다른 쪽이 남는다.

INSERT INTO "menu_access" ("id", "menuKey", "levelKey", "canView", "canEdit", "createdAt")
VALUES ('ma_calendar_partner', 'calendar', 'partner', true, false, CURRENT_TIMESTAMP)
ON CONFLICT ("menuKey", "levelKey") DO UPDATE
  SET "canView" = true, "canEdit" = false;
