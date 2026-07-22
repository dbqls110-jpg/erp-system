import { NextRequest, NextResponse } from "next/server";
import { verifyBridgeApiKey } from "@/lib/agentAuth";
import { getAgentUser } from "@/lib/agentApi";
import {
  buildErpSourceUrl,
  detectAgentContextTopics,
  getKstDateParts,
  type AgentContextTopic,
} from "@/lib/agentJobContext";
import { searchDriveIndex } from "@/lib/driveIndex";
import { prisma } from "@/lib/prisma";

interface SourceItem {
  label: string;
  url: string;
  recordCount: number;
  asOf: string;
}

// GET /api/agent/jobs/[id]/context
// A bridge-only, job-bound context endpoint. The requester comes from AgentJob.userId,
// never from model-controlled query parameters.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.agentJob.findUnique({
    where: { id },
    select: {
      id: true,
      agentType: true,
      userId: true,
      input: true,
      sourceMessageId: true,
    },
  });
  if (!job) return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
  if (!verifyBridgeApiKey(req, job.agentType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [requester, agentUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: job.userId },
      select: { id: true, name: true, role: true, active: true, isAgent: true },
    }),
    getAgentUser(job.agentType),
  ]);
  if (!requester || !requester.active || requester.isAgent) {
    return NextResponse.json({ error: "활성 ERP 요청자를 찾을 수 없습니다." }, { status: 404 });
  }

  const topics = detectAgentContextTopics(job.input);
  const clock = getKstDateParts();
  const data: Record<string, unknown> = {};
  const sources: SourceItem[] = [];
  const origin = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  const secretLikeQuery = /(api\s*key|api키|토큰|비밀번호|패스워드|secret|환경변수|인증키)/i.test(job.input);
  const driveSearchPromise = secretLikeQuery
    ? Promise.resolve([])
    : searchDriveIndex(job.input, requester.role, 5).catch(() => []);

  const tasks: Partial<Record<AgentContextTopic, Promise<void>>> = {};

  if (topics.includes("attendance")) {
    tasks.attendance = (async () => {
      const records = await prisma.attendance.findMany({
        where: { userId: requester.id, date: { gte: clock.monthStart, lte: clock.monthEnd } },
        orderBy: { date: "desc" },
        take: 31,
      });
      data.attendance = {
        scope: "requester_only",
        requesterName: requester.name,
        today: clock.date,
        todayRecord: records.find((record) => record.date === clock.date) ?? null,
        monthRecords: records,
      };
      sources.push({
        label: "ERP 근태 관리",
        url: buildErpSourceUrl(origin, "/attendance"),
        recordCount: records.length,
        asOf: clock.asOf,
      });
    })();
  }

  if (topics.includes("leave")) {
    tasks.leave = (async () => {
      const [balance, requests] = await Promise.all([
        prisma.leaveBalance.findUnique({
          where: { userId_year: { userId: requester.id, year: clock.year } },
          select: { totalDays: true, usedDays: true, pendingDays: true, updatedAt: true },
        }),
        prisma.leaveRequest.findMany({
          where: { userId: requester.id },
          select: {
            id: true,
            type: true,
            startDate: true,
            endDate: true,
            startTime: true,
            endTime: true,
            days: true,
            status: true,
            reason: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      ]);
      const totalDays = balance?.totalDays ?? 15;
      const usedDays = balance?.usedDays ?? 0;
      const pendingDays = balance?.pendingDays ?? 0;
      data.leave = {
        scope: "requester_only",
        requesterName: requester.name,
        year: clock.year,
        balance: {
          totalDays,
          usedDays,
          pendingDays,
          remainingDays: Math.max(0, totalDays - usedDays - pendingDays),
        },
        requests,
      };
      sources.push({
        label: "ERP 휴가 관리",
        url: buildErpSourceUrl(origin, "/leave"),
        recordCount: requests.length,
        asOf: clock.asOf,
      });
    })();
  }

  if (topics.includes("calendar")) {
    tasks.calendar = (async () => {
      const events = await prisma.calendarEvent.findMany({
        where: { date: { gte: clock.monthStart, lte: clock.monthEnd } },
        select: {
          id: true,
          title: true,
          date: true,
          endDate: true,
          color: true,
          createdAt: true,
          user: { select: { name: true } },
        },
        orderBy: { date: "asc" },
        take: 100,
      });
      data.calendar = {
        scope: "company_calendar",
        today: clock.date,
        todayEvents: events.filter((event) =>
          event.date <= clock.date && (event.endDate ?? event.date) >= clock.date),
        monthEvents: events,
      };
      sources.push({
        label: "ERP 캘린더",
        url: buildErpSourceUrl(origin, "/calendar"),
        recordCount: events.length,
        asOf: clock.asOf,
      });
    })();
  }

  if (topics.includes("projects")) {
    tasks.projects = (async () => {
      const projects = await prisma.project.findMany({
        where: { status: "active" },
        select: {
          id: true,
          name: true,
          client: true,
          deadline: true,
          progress: true,
          assignee: true,
          memo: true,
          updatedAt: true,
          files: { select: { name: true, driveUrl: true }, take: 10 },
        },
        orderBy: { updatedAt: "desc" },
        take: 30,
      });
      data.projects = { scope: "active_projects", items: projects };
      sources.push({
        label: "ERP 프로젝트",
        url: buildErpSourceUrl(origin, "/projects"),
        recordCount: projects.length,
        asOf: clock.asOf,
      });
    })();
  }

  if (topics.includes("finance")) {
    tasks.finance = (async () => {
      const [budget, expenses, fixedExpenses] = await Promise.all([
        prisma.budget.findUnique({ where: { year_month: { year: clock.year, month: clock.month } } }),
        prisma.expense.findMany({
          where: { date: { gte: clock.monthStart, lte: clock.monthEnd } },
          select: { id: true, date: true, title: true, category: true, amount: true, memo: true },
          orderBy: { date: "desc" },
          take: 100,
        }),
        prisma.fixedExpense.findMany({
          select: { id: true, name: true, amount: true, category: true, dayOfMonth: true },
          orderBy: { order: "asc" },
        }),
      ]);
      const totalExpense = expenses.reduce((sum, expense) => sum + expense.amount, 0);
      data.finance = {
        scope: "company_finance",
        year: clock.year,
        month: clock.month,
        budget: budget?.amount ?? null,
        totalExpense,
        remainingBudget: budget ? budget.amount - totalExpense : null,
        expenses,
        fixedExpenses,
      };
      sources.push({
        label: "ERP 재무 관리",
        url: buildErpSourceUrl(origin, "/finance"),
        recordCount: expenses.length,
        asOf: clock.asOf,
      });
    })();
  }

  if (topics.includes("users")) {
    tasks.users = (async () => {
      const users = await prisma.user.findMany({
        where: { active: true, isAgent: false, role: { not: "pending" } },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      });
      data.users = { scope: "active_employees", items: users };
      sources.push({
        label: "ERP 직원 목록",
        url: buildErpSourceUrl(origin, "/messenger"),
        recordCount: users.length,
        asOf: clock.asOf,
      });
    })();
  }

  await Promise.all(Object.values(tasks));

  const driveResults = await driveSearchPromise;
  if (driveResults.length > 0) {
    data.driveKnowledge = {
      scope: "configured_drive_folders",
      results: driveResults,
    };
    for (const result of driveResults) {
      if (!result.url) continue;
      sources.push({
        label: `Google Drive · ${result.name}`,
        url: result.url,
        recordCount: 1,
        asOf: result.modifiedTime ?? clock.asOf,
      });
    }
  }

  let history: Array<{ role: "agent" | "user"; content: string; createdAt: Date }> = [];
  if (agentUser) {
    const [participantA, participantB] = [agentUser.id, requester.id].sort();
    const conversation = await prisma.conversation.findUnique({
      where: { participantA_participantB: { participantA, participantB } },
      select: {
        messages: {
          where: job.sourceMessageId ? { id: { not: job.sourceMessageId } } : undefined,
          select: { senderId: true, content: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });
    history = (conversation?.messages ?? []).reverse().map((message) => ({
      role: message.senderId === agentUser.id ? "agent" : "user",
      content: message.content,
      createdAt: message.createdAt,
    }));
  }

  return NextResponse.json({
    jobId: job.id,
    requester: { id: requester.id, name: requester.name, role: requester.role },
    topics,
    data,
    sources,
    history,
    asOf: clock.asOf,
  });
}
