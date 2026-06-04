import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const { searchParams } = req.nextUrl;
  const year = parseInt(searchParams.get("year") ?? String(now.getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(now.getMonth() + 1));
  const monthStr = String(month).padStart(2, "0");
  const start = `${year}-${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

  const [budget, expenses, fixedExpenses] = await Promise.all([
    prisma.budget.findUnique({ where: { year_month: { year, month } } }),
    prisma.expense.findMany({ where: { date: { gte: start, lte: end } }, orderBy: { date: "desc" } }),
    prisma.fixedExpense.findMany({ orderBy: { order: "asc" } }),
  ]);

  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const totalFixed = fixedExpenses.reduce((s, f) => s + f.amount, 0);
  const otherExpense = expenses.filter(e => !e.fixedExpenseId).reduce((s, e) => s + e.amount, 0);
  const remaining = budget ? budget.amount - totalFixed - otherExpense : null;

  return NextResponse.json({
    year, month,
    budget: budget?.amount ?? null,
    totalExpense,
    totalFixed,
    otherExpense,
    remaining,
    fixedExpenses,
    expenses,
  });
}
