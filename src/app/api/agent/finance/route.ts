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
  const end = `${year}-${monthStr}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

  const [budget, expenses] = await Promise.all([
    prisma.budget.findUnique({ where: { year_month: { year, month } } }),
    prisma.expense.findMany({ where: { date: { gte: start, lte: end } }, orderBy: { date: "desc" } }),
  ]);

  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const remainingBudget = budget ? budget.amount - totalExpense : null;

  const byCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  return NextResponse.json({
    year, month,
    budget: budget?.amount ?? null,
    totalExpense,
    remainingBudget,
    byCategory,
    expenses,
  });
}
