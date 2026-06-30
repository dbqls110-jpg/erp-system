import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addMonthSheet } from "@/lib/sheets";

const CATEGORY_LABEL: Record<string, string> = {
  rent: "임차료", salary: "인건비", telecom: "통신비",
  supplies: "비품", food: "식대", software: "소프트웨어",
  insurance: "4대보험", other: "기타",
};

const CATEGORY_COLOR: Record<string, string> = {
  rent: "#7b68ee", salary: "#0091ff", telecom: "#6647f0",
  supplies: "#514b81", food: "#ff5b36", software: "#22c55e",
  insurance: "#f59e0b", other: "#b3b3b3",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    return NextResponse.json({ ok: false, error: "GOOGLE_SHEET_ID 환경변수 없음" });
  }

  const now = new Date();
  const year = parseInt(searchParams.get("year") ?? String(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(now.getMonth() === 0 ? 12 : now.getMonth()));

  const monthStr = String(month).padStart(2, "0");
  const daysInMonth = new Date(year, month, 0).getDate();
  const start = `${year}-${monthStr}-01`;
  const end = `${year}-${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

  const [budget, expenses] = await Promise.all([
    prisma.budget.findUnique({ where: { year_month: { year, month } } }),
    prisma.expense.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: "asc" },
      include: { user: { select: { name: true } } },
    }),
  ]);

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  const summaryMap: Record<string, number> = {};
  for (const e of expenses) {
    summaryMap[e.category] = (summaryMap[e.category] ?? 0) + e.amount;
  }
  const categoryTotals = Object.entries(summaryMap)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amount]) => ({
      label: CATEGORY_LABEL[cat] ?? cat,
      amount,
      color: CATEGORY_COLOR[cat] ?? "#b3b3b3",
    }));

  try {
    await addMonthSheet(spreadsheetId, {
      year, month,
      budget: budget?.amount ?? null,
      total,
      categoryTotals,
      expenses: expenses.map(e => ({
        date: e.date,
        title: e.title,
        category: CATEGORY_LABEL[e.category] ?? e.category,
        amount: e.amount,
        userName: e.user.name ?? "",
        memo: e.memo ?? "",
      })),
    });
    return NextResponse.json({ ok: true, year, month, count: expenses.length, total });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
