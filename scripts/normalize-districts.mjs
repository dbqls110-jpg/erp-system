#!/usr/bin/env node
/**
 * 주소를 기준으로 기존 venues.district 표기를 정리한다.
 *
 * 사용법:
 *   node scripts/normalize-districts.mjs --dry-run
 *   node scripts/normalize-districts.mjs
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { districtFromAddress, normalizeDistrictValue } from "../src/lib/venueDistrict.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
/**
 * 백업은 실행할 때마다 새 파일로 남긴다.
 * 한 이름을 쓰면 재실행 시 앞 실행의 이전값이 덮여 되돌릴 수 없다.
 * (2026-09-09 연결이 끊겨 두 번 돌렸을 때 실제로 그랬다.)
 */
const BACKUP_PATH = path.resolve(
  `backup/자치구_변경_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`,
);

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const venues = await prisma.venue.findMany({
      select: { id: true, name: true, district: true, address: true },
      orderBy: { id: "asc" },
    });

    const changes = venues.flatMap((venue) => {
      // 주소가 정본이다. 주소로 못 뽑으면 값 자체라도 표준형으로 올린다.
      // 그러지 않으면 "부천시" 처럼 접두어 없는 값이 남아 지역 검색에서 빠진다.
      const nextDistrict =
        districtFromAddress(venue.address) ?? normalizeDistrictValue(venue.district);
      if (!nextDistrict || nextDistrict === venue.district) return [];
      return [{
        id: venue.id,
        name: venue.name,
        previousDistrict: venue.district,
        newDistrict: nextDistrict,
      }];
    });

    console.log(`전체 ${venues.length}건 · 변경 ${changes.length}건`);

    if (DRY_RUN) {
      console.log("--dry-run 이라 DB와 백업 파일을 변경하지 않습니다.");
      for (const change of changes) console.log(JSON.stringify(change));
      return;
    }

    fs.mkdirSync(path.dirname(BACKUP_PATH), { recursive: true });
    fs.writeFileSync(BACKUP_PATH, `${JSON.stringify(changes, null, 2)}\n`, "utf8");
    console.log(`변경 전 백업: ${BACKUP_PATH}`);

    /** 한 줄씩 갱신하면 수천 행에 수십 분이 걸린다. DB 가 미국에 있어 왕복이 비싸다. */
    const CHUNK = 1000;
    for (let i = 0; i < changes.length; i += CHUNK) {
      const slice = changes.slice(i, i + CHUNK);
      const values = slice.map((_, n) => `($${n * 2 + 1}, $${n * 2 + 2})`).join(",");
      const params = slice.flatMap((c) => [c.id, c.newDistrict]);
      await prisma.$executeRawUnsafe(
        `UPDATE venues SET "district" = v.d FROM (VALUES ${values}) AS v(id, d) WHERE venues.id = v.id`,
        ...params,
      );
      process.stdout.write(`  ${Math.min(i + CHUNK, changes.length)}/${changes.length}`);
    }
    console.log(`
자치구 변경 완료: ${changes.length}건`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("\n실패:", error.message);
  process.exitCode = 1;
});
