CREATE TABLE IF NOT EXISTS "access_levels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "access_levels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "menu_access" (
    "id" TEXT NOT NULL,
    "menuKey" TEXT NOT NULL,
    "levelKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "menu_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "access_levels_key_key" ON "access_levels"("key");
CREATE UNIQUE INDEX IF NOT EXISTS "menu_access_menuKey_levelKey_key" ON "menu_access"("menuKey", "levelKey");
CREATE INDEX IF NOT EXISTS "menu_access_menuKey_idx" ON "menu_access"("menuKey");
