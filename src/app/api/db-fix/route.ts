import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createNotionEvent } from "@/lib/notion";

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: "연차", half_am: "반차(오전)", half_pm: "반차(오후)", hourly: "시간차",
};

export async function GET() {
  try {
    await prisma.$executeRaw`ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "notionPageId" TEXT`;
    return NextResponse.json({ ok: true, message: "notionPageId 컬럼 추가 완료" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}

// 기존 승인된 휴가 → Notion 일괄 동기화
export async function POST() {
  const leaves = await prisma.leaveRequest.findMany({
    where: { status: "approved", notionPageId: null },
    include: { user: { select: { name: true } } },
  });

  const results = [];
  for (const leave of leaves) {
    const title = `🌴 ${leave.user.name ?? "직원"} ${LEAVE_TYPE_LABEL[leave.type] ?? "휴가"}`;
    const endDate = leave.endDate !== leave.startDate ? leave.endDate : undefined;
    const notionPageId = await createNotionEvent(title, leave.startDate, endDate);
    if (notionPageId) {
      await prisma.leaveRequest.update({ where: { id: leave.id }, data: { notionPageId } });
      results.push({ id: leave.id, title, date: leave.startDate, notionPageId });
    }
  }

  return NextResponse.json({ ok: true, synced: results.length, results });
}
