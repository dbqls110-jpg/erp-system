-- 공간 호스트: 사용자를 공간 DB 의 한 공간에 연결한다. 파트너·거래처 연결과 같은 성격.
ALTER TABLE "users" ADD COLUMN "venueId" TEXT;
CREATE INDEX "users_venueId_idx" ON "users"("venueId");
ALTER TABLE "users" ADD CONSTRAINT "users_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 외부인의 담당 직원. 메신저에서 외부인은 이 사람에게만 말을 걸 수 있다.
ALTER TABLE "users" ADD COLUMN "staffUserId" TEXT;
CREATE INDEX "users_staffUserId_idx" ON "users"("staffUserId");
ALTER TABLE "users" ADD CONSTRAINT "users_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 공간 호스트 레벨. 파트너와 같은 외부인 등급(rank 10).
INSERT INTO "access_levels" ("id", "name", "key", "rank", "isSystem", "createdAt", "updatedAt")
SELECT 'lvl_host', '공간 호스트', 'host', 10, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "access_levels" WHERE "key" = 'host');

-- 파트너와 같은 메뉴: 대시보드(외부용)·메신저(수정 가능)·캘린더(보기만).
INSERT INTO "menu_access" ("id", "menuKey", "levelKey", "canView", "canEdit", "createdAt")
SELECT 'ma_host_' || m.k, m.k, 'host', true, m.e, NOW()
FROM (VALUES ('dashboard', false), ('messenger', true), ('calendar', false)) AS m(k, e)
WHERE NOT EXISTS (SELECT 1 FROM "menu_access" WHERE "menuKey" = m.k AND "levelKey" = 'host');
