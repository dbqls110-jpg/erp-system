import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSpreadsheet, addMonthSheet } from "@/lib/sheets";

const CATEGORY_LABEL: Record<string, string> = {
  rent: "임차료", salary: "인건비", telecom: "통신비",
  supplies: "비품", food: "식대", software: "소프트웨어",
  insurance: "4대보험", other: "기타",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // ?setup=1 이면 스프레드시트 새로 생성 후 ID 반환
  if (searchParams.get("setup") === "1") {
    try {
      const id = await createSpreadsheet();
      return NextResponse.json({ ok: true, spreadsheetId: id, url: `https://docs.google.com/spreadsheets/d/${id}` });
    } catch (e) {
      return NextResponse.json({ ok: false, error: String(e) });
    }
  }

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    return NextResponse.json({ ok: false, error: "GOOGLE_SHEET_ID 환경변수 없음. ?setup=1 로 먼저 생성하세요." });
  }

  // 기본값: 전달 (매달 1일 실행 기준)
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

  // 카테고리별 합계
  const summary: Record<string, number> = {};
  for (const e of expenses) {
    summary[e.category] = (summary[e.category] ?? 0) + e.amount;
  }
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  const rows: (string | number)[][] = [
    [`${year}년 ${month}월 재무 관리`],
    [],
    ["날짜", "항목", "카테고리", "금액", "작성자", "메모"],
    ...expenses.map(e => [
      e.date,
      e.title,
      CATEGORY_LABEL[e.category] ?? e.category,
      e.amount,
      e.user.name ?? "",
      e.memo ?? "",
    ]),
    [],
    ["카테고리별 합계"],
    ["카테고리", "금액"],
    ...Object.entries(summary).map(([cat, amt]) => [CATEGORY_LABEL[cat] ?? cat, amt]),
    [],
    ["총 지출", total],
    ...(budget ? [["예산", budget.amount], ["잔여", budget.amount - total]] : []),
  ];

  try {
    await addMonthSheet(spreadsheetId, year, month, rows);
    return NextResponse.json({ ok: true, year, month, count: expenses.length, total });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
