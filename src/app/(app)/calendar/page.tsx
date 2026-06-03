import { prisma } from "@/lib/prisma";
import { CalendarView } from "./CalendarView";

export default async function CalendarPage() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStr = String(month).padStart(2, "0");

  const [projects, leaves] = await Promise.all([
    prisma.project.findMany({
      where: {
        status: "active",
        OR: [
          { announceDate: { gte: `${year}-${monthStr}-01` } },
          { deadline: { gte: `${year}-${monthStr}-01` } },
        ],
      },
      select: { id: true, name: true, announceDate: true, deadline: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: "approved",
        startDate: { gte: `${year}-${monthStr}-01` },
      },
      include: { user: { select: { name: true } } },
    }),
  ]);

  const events = [
    ...projects.flatMap((p) => {
      const evts = [];
      if (p.announceDate) evts.push({ date: p.announceDate, title: `📢 ${p.name} 발표`, type: "announce" as const, id: p.id });
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
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)", letterSpacing: "-0.91px" }}>
        캘린더
      </h1>
      <CalendarView initialEvents={events} currentYear={year} currentMonth={month} />
    </div>
  );
}
