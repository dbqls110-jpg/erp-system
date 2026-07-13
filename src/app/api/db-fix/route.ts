import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotionEvent } from "@/lib/notion";

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: "연차", half_am: "반차(오전)", half_pm: "반차(오후)", hourly: "시간차",
};

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);

  // ?sync=leave 이면 기존 승인 휴가 Notion 일괄 동기화
  if (searchParams.get("sync") === "leave") {
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

  try {
    await prisma.$executeRaw`ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "notionPageId" TEXT`;
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "sheet_links" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "description" TEXT,
        "category" TEXT,
        "order" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "sheet_links_pkey" PRIMARY KEY ("id")
      )
    `;
    return NextResponse.json({ ok: true, message: "DB 수정 완료" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
