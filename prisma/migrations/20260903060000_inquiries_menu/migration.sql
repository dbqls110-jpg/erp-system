-- 문의 칸반 메뉴. 고객 연락처와 문의 내용이 담기므로 팀장 이상만 본다.
INSERT INTO "menu_access" ("id", "menuKey", "levelKey", "canView", "canEdit", "createdAt")
SELECT gen_random_uuid()::text, 'inquiries', t.lvl, true, true, NOW()
FROM (VALUES ('admin'), ('manager')) AS t(lvl)
WHERE NOT EXISTS (
  SELECT 1 FROM "menu_access" WHERE "menuKey" = 'inquiries' AND "levelKey" = t.lvl
);
