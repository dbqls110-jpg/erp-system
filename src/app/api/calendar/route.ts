import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNotionEvents } from "@/lib/notion";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const monthStr = String(month).padStart(2, "0");
  const start = `${year}-${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

  const leaveTypeLabel: Record<string, string> = {
    annual: "연차",
    half_am: "반차(오전)",
    half_pm: "반차(오후)",
    hourly: "시간차",
  };

  const [projects, leaves, customEvents, notionEvents] = await Promise.all([
    prisma.project.findMany({
      where: {
        OR: [
          { announceDate: { gte: start, lte: end } },
          { deadline: { gte: start, lte: end } },
        ],
      },
      select: { id: true, name: true, announceDate: true, deadline: true },
    }),
    prisma.leaveRequest.findMany({
      where: { status: "approved", startDate: { gte: start, lte: end } },
      include: { user: { select: { name: true } } },
    }),
    prisma.calendarEvent.findMany({
      where: { date: { gte: start, lte: end } },
      select: { id: true, title: true, date: true, endDate: true, color: true, notionPageId: true },
    }),
    getNotionEvents(year, month).catch(() => []),
  ]);

  // ERP에서 이미 Notion과 연결된 페이지 ID 목록 (중복 방지)
  const linkedNotionIds = new Set(customEvents.map((e) => e.notionPageId).filter(Boolean));

  const events = [
    ...projects.flatMap((p) => {
      const evts = [];
      if (p.announceDate) evts.push({ date: p.announceDate, title: `📢 ${p.name} 발표`, type: "announce", id: p.id });
      if (p.deadline) evts.push({ date: p.deadline, title: `🎯 ${p.name} 마감`, type: "deadline", id: p.id });
      return evts;
    }),
    ...leaves.map((l) => ({
      date: l.startDate,
      title: `🌴 ${l.user.name ?? "직원"} ${leaveTypeLabel[l.type] ?? "휴가"}`,
      type: "leave",
      id: l.id,
      endDate: l.endDate,
    })),
    ...customEvents.map((e) => ({
      date: e.date,
      title: e.title,
      type: "custom" as const,
      id: e.id,
      endDate: e.endDate ?? undefined,
      color: e.color,
    })),
    // Notion 전용 일정 (ERP에서 생성하지 않은 것만)
    ...notionEvents
      .filter((e) => !linkedNotionIds.has(e.notionId))
      .map((e) => ({
        date: e.date,
        title: e.title,
        type: "notion" as const,
        id: e.notionId,
        endDate: e.endDate,
      })),
  ];

  return NextResponse.json(events);
}
