/**
 * 제외 목록(src/lib/venueBlocklist.mjs)에 걸리는 공간을 venues 표에서 지운다.
 *
 * 적재 스크립트도 끝에 같은 일을 하지만, 목록에 새로 추가했을 때 적재 없이 바로 반영하려면
 * 이걸 돌린다. 지우기 전에 backup/ 에 원본 행을 남긴다.
 *
 *   node scripts/apply-venue-blocklist.mjs            지운다
 *   node scripts/apply-venue-blocklist.mjs --dry-run  뭐가 걸리는지만 본다
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { blockedReason, VENUE_BLOCKLIST } from "../src/lib/venueBlocklist.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

try {
  console.log(`제외 목록 ${VENUE_BLOCKLIST.length}곳`);
  const all = await prisma.venue.findMany({ select: { id: true, name: true, address: true } });
  const hits = all.map((v) => ({ ...v, reason: blockedReason(v) })).filter((v) => v.reason);
  console.log(`venues ${all.length}건 중 걸린 행 ${hits.length}건`);
  for (const v of hits) console.log(`  · ${v.name} | ${v.address ?? "-"} — ${v.reason}`);
  if (DRY_RUN || hits.length === 0) {
    if (DRY_RUN) console.log("--dry-run 이라 지우지 않습니다.");
  } else {
    const ids = hits.map((v) => v.id);
    const backup = path.join("backup", `제외목록_삭제_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.mkdirSync("backup", { recursive: true });
    fs.writeFileSync(backup, JSON.stringify(await prisma.venue.findMany({ where: { id: { in: ids } } }), null, 2));
    const r = await prisma.venue.deleteMany({ where: { id: { in: ids } } });
    console.log(`삭제 ${r.count}건 · 백업 ${backup}`);
    console.log(`venues 표 총 ${await prisma.venue.count()}건`);
  }
} finally {
  await prisma.$disconnect();
}
