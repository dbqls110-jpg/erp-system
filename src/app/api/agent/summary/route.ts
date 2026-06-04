import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().split("T")[0];
  const weekLater = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStr = String(month).padStart(2, "0");
  const monthStart = `${year}-${monthStr}-01`;
  const monthEnd = `${year}-${monthStr}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

  const [todayAtt, pendingLeaves, upcomingProjects, budget, expenses, fixedExpenses] = await Promise.all([
    prisma.attendance.findMany({
      where: { date: today },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.leaveRequest.findMany({
      where: { status: "pending" },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    prisma.project.findMany({
      where: { status: "active", deadline: { gte: today, lte: weekLater } },
      select: { id: true, name: true, deadline: true, assignee: true, progress: true },
      orderBy: { deadline: "asc" },
    }),
    prisma.budget.findUnique({ where: { year_month: { year, month } } }),
    prisma.expense.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } }),
    prisma.fixedExpense.aggregate({ _sum: { amount: true } }),
  ]);

  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const totalFixed = fixedExpenses._sum.amount ?? 0;
  const otherExpense = expenses.filter(e => !e.fixedExpenseId).reduce((s, e) => s + e.amount, 0);
  const remaining = budget ? budget.amount - totalFixed - otherExpense : null;

  return NextResponse.json({
    todayAttendance: {
      date: today,
      count: todayAtt.length,
      records: todayAtt,
    },
    pendingLeaves: {
      count: pendingLeaves.length,
      items: pendingLeaves.map(l => ({
        id: l.id, user: l.user.name, type: l.type,
        startDate: l.startDate, endDate: l.endDate, days: l.days,
      })),
    },
    upcomingProjects,
    finance: {
      year, month,
      budget: budget?.amount ?? null,
      totalExpense,
      totalFixed,
      otherExpense,
      remaining,
    },
  });
}
