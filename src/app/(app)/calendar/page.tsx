import { getServerSession } from "next-auth";
import { requireMenuAccess } from "@/lib/permissions";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNotionEvents } from "@/lib/notion";
import { CalendarView } from "./CalendarView";

import { getCalendarViewer } from "@/lib/calendarViewer";
import {
  calendarWhereFor,
  projectWhereFor,
  showLeaves,
  showNotionEvents,
} from "@/lib/calendarVisibility";

export default async function CalendarPage() {
  // 사이드바에서 메뉴를 숨기는 것만으로는 못 막는다. 주소를 직접 치면 그냥 열린다.
  const session = await getServerSession(authOptions);
  await requireMenuAccess(session!.user.id, "calendar", session!.user.role);

  // 파트너·거래처 계정은 자기가 참여한 프로젝트의 일정만 본다. 캘린더는 네 곳에서
  // 자료를 모으므로 네 곳 모두 걸러야 한다 — 일정만 가리면 프로젝트 마감일과
  // 직원 휴가가 그대로 새어 나간다.
  const viewer = (await getCalendarViewer())!;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStr = String(month).padStart(2, "0");

  const [projects, projectOptions, leaves, customEvents, notionEvents] = await Promise.all([
    prisma.project.findMany({
      where: {
        status: "active",
        AND: [
          {
            OR: [
              { announceDate: { gte: `${year}-${monthStr}-01` } },
              { deadline: { gte: `${year}-${monthStr}-01` } },
            ],
          },
          projectWhereFor(viewer),
        ],
      },
      select: { id: true, name: true, announceDate: true, deadline: true },
    }),
    prisma.project.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    showLeaves(viewer)
      ? prisma.leaveRequest.findMany({
          where: {
            status: "approved",
            startDate: { gte: `${year}-${monthStr}-01` },
          },
          include: { user: { select: { name: true } } },
        })
      : [],
    prisma.calendarEvent.findMany({
      where: { AND: [{ date: { gte: `${year}-${monthStr}-01` } }, calendarWhereFor(viewer)] },
      select: { id: true, title: true, date: true, endDate: true, color: true, notionPageId: true, projectId: true },
    }),
    showNotionEvents(viewer) ? getNotionEvents(year, month).catch(() => []) : [],
  ]);

  const linkedNotionIds = new Set([
    ...customEvents.map((e) => e.notionPageId),
    ...leaves.map((l) => (l as { notionPageId?: string | null }).notionPageId),
  ].filter(Boolean) as string[]);

  const events = [
    ...projects.flatMap((p) => {
      const evts = [];
      if (p.deadline) evts.push({ date: p.deadline, title: `🎯 ${p.name} 마감`, type: "deadline" as const, id: p.id });
      return evts;
    }),
    ...leaves.map((l) => {
      const typeLabel: Record<string, string> = {
        annual: "연차", half_am: "반차(오전)", half_pm: "반차(오후)", hourly: "시간차",
      };
      return {
        date: l.startDate,
        title: `🌴 ${l.user.name ?? "직원"} ${typeLabel[l.type] ?? "휴가"}`,
        type: "leave" as const,
        id: l.id,
        endDate: l.endDate,
      };
    }),
    ...customEvents.map((e) => ({
      date: e.date,
      title: e.title,
      type: "custom" as const,
      id: e.id,
      endDate: e.endDate ?? undefined,
      color: e.color,
      projectId: e.projectId,
    })),
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

  return (
    <div className="space-y-4">
      <div><p className="mt-1 text-sm text-muted-foreground">프로젝트와 휴가 일정을 한눈에 확인하세요.</p></div>
      <CalendarView initialEvents={events} currentYear={year} currentMonth={month} projectOptions={projectOptions} />
    </div>
  );
}
