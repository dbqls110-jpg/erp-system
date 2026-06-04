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

  const [
    pendingLeaves,
    activeProjects,
    deadlineSoon,
    todayAttendance,
    budget,
    expenses,
    fixedExpenses,
  ] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { status: "pending" },
      include: { user: { select: { name: true } } },
    }),
    prisma.project.count({ where: { status: "active" } }),
    prisma.project.findMany({
      where: { status: "active", deadline: { gte: today, lte: weekLater } },
      select: { id: true, name: true, deadline: true, assignee: true },
      orderBy: { deadline: "asc" },
    }),
    prisma.attendance.findMany({
      where: { date: today },
      include: { user: { select: { name: true } } },
    }),
    prisma.budget.findUnique({ where: { year_month: { year, month } }, select: { amount: true } }),
    prisma.expense.aggregate({ where: { date: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.fixedExpense.aggregate({ _sum: { amount: true } }),
  ]);

  const totalExpense = expenses._sum.amount ?? 0;
  const totalFixed = fixedExpenses._sum.amount ?? 0;
  const otherExpense = totalExpense > totalFixed ? totalExpense - totalFixed : 0;
  const remaining = budget ? budget.amount - totalFixed - otherExpense : null;

  return NextResponse.json({
    today,
    pendingLeaves: pendingLeaves.map(l => ({ id: l.id, user: l.user.name, type: l.type, startDate: l.startDate, days: l.days })),
    activeProjects,
    deadlineSoon,
    todayAttendance: {
      count: todayAttendance.length,
      present: todayAttendance.map(a => a.user.name),
    },
    finance: {
      budget: budget?.amount ?? null,
      remaining,
      totalFixed,
      otherExpense,
    },
  });
}
