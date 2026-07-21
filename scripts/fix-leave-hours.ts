import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  const hourlyRequests = await prisma.leaveRequest.findMany({
    where: { type: "hourly", startTime: { not: null }, endTime: { not: null } },
  });

  console.log(`hourly 휴가 레코드 ${hourlyRequests.length}건 발견`);

  for (const req of hourlyRequests) {
    const [sh, sm] = req.startTime!.split(":").map(Number);
    const [eh, em] = req.endTime!.split(":").map(Number);
    const hours = (eh * 60 + em - sh * 60 - sm) / 60;
    const newDays = Math.round((hours / 8) * 100) / 100;
    const diff = newDays - req.days;

    if (Math.abs(diff) < 0.0001) {
      console.log(`  SKIP [${req.id.slice(0, 8)}] 이미 8시간 기준 (${req.days}일)`);
      continue;
    }

    console.log(`  UPDATE [${req.id.slice(0, 8)}] ${req.days}일 → ${newDays}일 (diff: ${diff > 0 ? "+" : ""}${diff.toFixed(4)})`);

    const year = new Date(req.startDate).getFullYear();
    const balanceUpdate =
      req.status === "approved"
        ? { usedDays: { increment: diff } }
        : req.status === "pending"
        ? { pendingDays: { increment: diff } }
        : {};

    await prisma.$transaction([
      prisma.leaveRequest.update({ where: { id: req.id }, data: { days: newDays } }),
      ...(Object.keys(balanceUpdate).length > 0
        ? [prisma.leaveBalance.updateMany({ where: { userId: req.userId, year }, data: balanceUpdate })]
        : []),
    ]);
  }

  // 부동소수점 오차 정리
  const balances = await prisma.leaveBalance.findMany();
  for (const b of balances) {
    const roundedUsed = Math.round(b.usedDays * 10000) / 10000;
    const roundedPending = Math.round(b.pendingDays * 10000) / 10000;
    if (roundedUsed !== b.usedDays || roundedPending !== b.pendingDays) {
      await prisma.leaveBalance.update({
        where: { id: b.id },
        data: { usedDays: roundedUsed, pendingDays: roundedPending },
      });
      console.log(`  BALANCE FIX usedDays: ${b.usedDays} → ${roundedUsed}`);
    }
  }

  console.log("완료!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
