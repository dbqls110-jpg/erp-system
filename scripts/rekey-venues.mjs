#!/usr/bin/env node
/**
 * venues 의 행 열쇠에서 자치구를 뺀다.
 *
 * 열쇠가 이름+자치구+위치였는데, 공간 DB 쪽이 자치구 표기를 "종로구" 에서
 * "서울 종로구" 로 바꾸면서 4,150행이 통째로 다른 행으로 읽히게 됐다. 그대로
 * 적재하면 갱신이 아니라 복제가 된다(5,345 → 9,493). 자치구는 어차피 주소에서
 * 다시 뽑으므로 열쇠에 넣을 이유가 없다.
 *
 * 이름+위치만으로도 원본 CSV 안에서 겹치는 행은 0건임을 확인했다.
 * DB 에서는 한 쌍만 겹치는데, 같은 공간이 두 줄로 들어간 것이다. 그런 경우
 * 가장 최근에 갱신된 행에만 새 열쇠를 주고 나머지는 옛 열쇠로 남긴다.
 * 지우는 것은 사람이 정할 일이라 여기서 하지 않는다.
 *
 * 사용법:
 *   node scripts/rekey-venues.mjs --dry-run
 *   node scripts/rekey-venues.mjs
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DRY_RUN = process.argv.includes("--dry-run");
const BACKUP_PATH = path.resolve(
  `backup/열쇠_변경_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`,
);

/** 새 열쇠. import-venues.mjs 의 sourceKey 와 같은 식이어야 한다. */
function nextKey(name, address) {
  const parts = [name, address].map((value) => (value ?? "").trim());
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 24);
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const venues = await prisma.venue.findMany({
      select: { id: true, name: true, address: true, sourceKey: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });

    const taken = new Set();
    const changes = [];
    const skipped = [];
    for (const venue of venues) {
      const key = nextKey(venue.name, venue.address);
      if (taken.has(key)) {
        // 같은 공간이 두 줄. 최신 행이 이미 새 열쇠를 가져갔다.
        skipped.push({ id: venue.id, name: venue.name, address: venue.address });
        continue;
      }
      taken.add(key);
      if (key === venue.sourceKey) continue;
      changes.push({ id: venue.id, name: venue.name, previousKey: venue.sourceKey, newKey: key });
    }

    console.log(`전체 ${venues.length}건 · 열쇠 바꿀 행 ${changes.length}건 · 겹쳐서 건너뛴 행 ${skipped.length}건`);
    for (const s of skipped) console.log(`  건너뜀: ${s.name} · ${String(s.address).slice(0, 40)}`);

    if (DRY_RUN) {
      console.log("--dry-run 이라 반영하지 않았습니다.");
      return;
    }

    fs.mkdirSync(path.dirname(BACKUP_PATH), { recursive: true });
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(changes, null, 2), "utf8");
    console.log(`변경 전 백업: ${BACKUP_PATH}`);

    /**
     * 한 줄씩 update 하면 5,000행에 수십 분이 걸린다. DB 가 미국에 있어 왕복이 비싸다.
     * VALUES 목록을 만들어 한 문장으로 밀어 넣는다.
     *
     * 두 번에 나눠 도는 것은 sourceKey 가 unique 라서다. 새 열쇠가 다른 행이 아직
     * 쥐고 있는 값일 수 있어, 먼저 임시값으로 비켜 두고 그 다음에 제 값을 넣는다.
     */
    async function bulkUpdate(pairs, label) {
      const CHUNK = 1000;
      for (let i = 0; i < pairs.length; i += CHUNK) {
        const slice = pairs.slice(i, i + CHUNK);
        const values = slice.map((_, n) => `($${n * 2 + 1}, $${n * 2 + 2})`).join(",");
        const params = slice.flatMap(([id, key]) => [id, key]);
        await prisma.$executeRawUnsafe(
          `UPDATE venues SET "sourceKey" = v.key FROM (VALUES ${values}) AS v(id, key) WHERE venues.id = v.id`,
          ...params,
        );
        process.stdout.write(`  ${label} ${Math.min(i + CHUNK, pairs.length)}/${pairs.length}`);
      }
      console.log("");
    }

    await bulkUpdate(changes.map((c) => [c.id, `tmp:${c.id}`]), "1단계");
    await bulkUpdate(changes.map((c) => [c.id, c.newKey]), "2단계");
    console.log(`열쇠 변경 완료: ${changes.length}건`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("\n실패:", err.message);
  process.exitCode = 1;
});
