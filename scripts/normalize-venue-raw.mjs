/**
 * 이미 적재된 venues.raw 를 정리 규칙(src/lib/venueColumns.mjs)으로 다시 쓴다.
 * 적재를 다시 돌리면 4,000행 × 미국 왕복이라 15분이 넘는다. raw 만 고치면 한 번에 끝난다.
 *
 *   node scripts/normalize-venue-raw.mjs --dry-run   몇 건이 바뀌는지, 칸 수 변화만
 *   node scripts/normalize-venue-raw.mjs             적용
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizeVenueRaw } from "../src/lib/venueColumns.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const rows = await prisma.venue.findMany({ select: { id: true, raw: true } });
  let changed = 0, before = 0, after = 0;
  const keysBefore = new Set(), keysAfter = new Set();
  const updates = [];
  for (const r of rows) {
    const raw = r.raw ?? {};
    const next = normalizeVenueRaw(raw);
    before += Object.keys(raw).length; after += Object.keys(next).length;
    for (const k of Object.keys(raw)) keysBefore.add(k);
    for (const k of Object.keys(next)) keysAfter.add(k);
    if (JSON.stringify(next) !== JSON.stringify(raw)) { changed += 1; updates.push({ id: r.id, raw: next }); }
  }
  console.log(`${rows.length}행 · 바뀌는 행 ${changed} · 칸 수 합계 ${before} → ${after} · 서로 다른 칸 이름 ${keysBefore.size} → ${keysAfter.size}`);
  console.log("정리 후 칸 이름:", [...keysAfter].sort().join(", "));
  if (DRY_RUN) { console.log("--dry-run"); }
  else {
    // 행마다 UPDATE 하면 미국 왕복이 4천 번이다. VALUES 로 묶어 500건씩 한 문장으로 보낸다.
    for (let i = 0; i < updates.length; i += 500) {
      const part = updates.slice(i, i + 500);
      const values = part.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2}::jsonb)`).join(", ");
      const params = part.flatMap((u) => [u.id, JSON.stringify(u.raw)]);
      await prisma.$executeRawUnsafe(
        `UPDATE venues AS v SET raw = d.raw, "updatedAt" = NOW() FROM (VALUES ${values}) AS d(id, raw) WHERE v.id = d.id`,
        ...params,
      );
      process.stdout.write(`\r  ${Math.min(i + 500, updates.length)}/${updates.length}`);
    }
    console.log("\n완료");
  }
} finally {
  await prisma.$disconnect();
}
