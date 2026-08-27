/**
 * 마이그레이션 SQL 을 트랜잭션 안에서 실행해 보고 반드시 롤백한다.
 *
 * Postgres 는 DDL 도 트랜잭션이라 롤백하면 흔적이 남지 않는다. 콜백 끝에서
 * 일부러 던져 Prisma 가 롤백하도록 만든다 — 정상 종료 경로가 아예 없으므로
 * 실수로 커밋될 여지가 없다.
 */
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SQL_PATH = process.argv[2];
if (!SQL_PATH) {
  console.error("사용법: node verify-migration.mjs <migration.sql 경로>");
  process.exit(1);
}

const raw = fs.readFileSync(SQL_PATH, "utf8");

// -- 주석을 걷어내고 세미콜론으로 나눈다. 이 파일에는 문자열 안에 ; 가 없다.
const statements = raw
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`구문 ${statements.length}개를 트랜잭션에서 시험합니다.\n`);

const ROLLBACK = Symbol("의도한 롤백");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

try {
  await prisma.$transaction(
    async (tx) => {
      for (const [i, sql] of statements.entries()) {
        const label = sql.split("\n")[0].slice(0, 70);
        await tx.$executeRawUnsafe(sql);
        console.log(`  ✓ ${i + 1}. ${label}`);
      }

      // 적용 후 상태를 트랜잭션 안에서 확인한다.
      const levels = await tx.$queryRawUnsafe(
        `SELECT "key", "name", "rank" FROM "access_levels" ORDER BY "rank" DESC`,
      );
      const access = await tx.$queryRawUnsafe(
        `SELECT "menuKey", "levelKey", "canView", "canEdit" FROM "menu_access" ORDER BY "menuKey", "levelKey"`,
      );
      const roles = await tx.$queryRawUnsafe(
        `SELECT "role", COUNT(*)::int AS n FROM "users" GROUP BY "role" ORDER BY "role"`,
      );

      console.log("\n=== 적용 후 레벨 ===");
      for (const l of levels) console.log(`  ${l.name} (${l.key}) rank=${l.rank}`);

      console.log(`\n=== 적용 후 메뉴 권한 ${access.length}건 ===`);
      const byMenu = new Map();
      for (const a of access) {
        if (!byMenu.has(a.menuKey)) byMenu.set(a.menuKey, []);
        byMenu.get(a.menuKey).push(`${a.levelKey}${a.canEdit ? "(수정)" : ""}`);
      }
      for (const [menu, list] of byMenu) console.log(`  ${menu}: ${list.join(", ")}`);

      console.log("\n=== 적용 후 사용자 role ===");
      for (const r of roles) console.log(`  ${r.role}: ${r.n}명`);

      throw ROLLBACK;
    },
    { timeout: 60_000 },
  );
} catch (err) {
  if (err === ROLLBACK) {
    console.log("\n✅ 전 구문 실행 성공 — 롤백했습니다. DB 는 그대로입니다.");
  } else {
    console.error("\n❌ 실패:", err.message);
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
