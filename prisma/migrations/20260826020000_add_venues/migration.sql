-- 대관 공간 표.
--
-- 넘겨받은 CSV 는 열이 150개인데 매칭과 화면에 쓰는 것만 컬럼으로 두고 나머지는
-- raw 에 담는다. 150개를 다 컬럼으로 만들면 대부분이 비어 있는 표가 되고,
-- 원본이 바뀔 때마다 마이그레이션을 해야 한다.
--
-- 같은 건물의 다른 방이 각각 한 행이다. 전화와 주소가 같아도 중복이 아니므로
-- 유일성은 이름·자치구·위치를 합친 sourceKey 로만 잡는다.

CREATE TABLE IF NOT EXISTS "venues" (
    "id"        TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,

    "name"     TEXT NOT NULL,
    "district" TEXT,
    "address"  TEXT,
    "type"     TEXT,

    "capacityMin" INTEGER,
    "capacityMax" INTEGER,
    "seats"       INTEGER,
    "areaM2"      DOUBLE PRECISION,

    "price"            INTEGER,
    "priceBasis"       TEXT,
    "priceSource"      TEXT,
    "baseHours"        DOUBLE PRECISION,
    "overUnit"         TEXT,
    "overRate"         DOUBLE PRECISION,
    "overAmount"       INTEGER,
    "weekendSurcharge" DOUBLE PRECISION,
    "vatType"          TEXT,

    "commercialUse" TEXT,

    "saturday" TEXT,
    "sunday"   TEXT,
    "holiday"  TEXT,

    "weekdayOpen"  TEXT,
    "weekdayClose" TEXT,
    "satOpen"      TEXT,
    "satClose"     TEXT,
    "sunOpen"      TEXT,
    "sunClose"     TEXT,

    "beam"        TEXT,
    "sound"       TEXT,
    "stage"       TEXT,
    "lighting"    TEXT,
    "hvac"        TEXT,
    "parking"     TEXT,
    "waitingRoom" TEXT,

    "electricity" TEXT,
    "restroom"    TEXT,
    "rainPlan"    TEXT,
    "shadeTent"   TEXT,
    "cooking"     TEXT,
    "noiseLimit"  TEXT,
    "rentalItems" TEXT,

    "phone"      TEXT,
    "reserveUrl" TEXT,

    "lat"       DOUBLE PRECISION,
    "lng"       DOUBLE PRECISION,
    "geoSource" TEXT,

    "calledAt"    TIMESTAMP(3),
    "calledPrice" INTEGER,
    "calledNote"  TEXT,

    "raw" JSONB,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "venues_sourceKey_key" ON "venues"("sourceKey");
CREATE INDEX IF NOT EXISTS "venues_district_idx"    ON "venues"("district");
CREATE INDEX IF NOT EXISTS "venues_type_idx"        ON "venues"("type");
CREATE INDEX IF NOT EXISTS "venues_capacityMax_idx" ON "venues"("capacityMax");
