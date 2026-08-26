import { prisma } from "@/lib/prisma";
import { addMonthSheet, type MonthReportData } from "@/lib/sheets";

/**
 * 월별 재무 시트를 빠짐없이 만든다.
 *
 * 예전에는 관리자가 /api/finance-report 를 직접 호출해야만 그 달 탭이 생겼다.
 * 아무도 부르지 않으면 아무 일도 안 일어나므로 실제로 7월과 8월이 통째로 비어
 * 있었다. 사람이 기억해서 눌러야 하는 자동화는 자동화가 아니다.
 *
 * 자료가 있는 첫 달부터 이번 달까지 훑어 없는 탭을 만든다. addMonthSheet 는
 * 탭이 있으면 내용만 덮으므로 여러 번 돌려도 안전하고, 이번 달은 돌 때마다
 * 최신 상태로 갱신된다.
 */

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

const SYNC_ACTION = "finance_sheet_sync";
/** 하루에 한 번이면 충분하다. 매 페이지 열람마다 구글을 두드릴 이유가 없다. */
const THROTTLE_MS = 24 * 60 * 60 * 1000;

/** 한 달치 보고 데이터를 만든다. 수동 호출 라우트와 자동 생성이 같은 것을 쓴다. */
export async function buildMonthReport(year: number, month: number): Promise<MonthReportData> {
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

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  const byCategory: Record<string, number> = {};
  for (const e of expenses) byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;

  return {
    year,
    month,
    budget: budget?.amount ?? null,
    total,
    categoryTotals: Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amount]) => ({
        label: CATEGORY_LABEL[cat] ?? cat,
        amount,
        color: CATEGORY_COLOR[cat] ?? "#b3b3b3",
      })),
    expenses: expenses.map((e) => ({
      date: e.date,
      title: e.title,
      category: CATEGORY_LABEL[e.category] ?? e.category,
      amount: e.amount,
      userName: e.user.name ?? "",
      memo: e.memo ?? "",
    })),
  };
}

/** 자료가 있는 가장 이른 달. 지출도 예산도 없으면 null. */
async function earliestMonth(): Promise<{ year: number; month: number } | null> {
  const [firstExpense, firstBudget] = await Promise.all([
    prisma.expense.findFirst({ orderBy: { date: "asc" }, select: { date: true } }),
    prisma.budget.findFirst({ orderBy: [{ year: "asc" }, { month: "asc" }], select: { year: true, month: true } }),
  ]);

  const candidates: { year: number; month: number }[] = [];
  if (firstExpense) {
    const [y, m] = firstExpense.date.split("-");
    candidates.push({ year: Number(y), month: Number(m) });
  }
  if (firstBudget) candidates.push({ year: firstBudget.year, month: firstBudget.month });
  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => a.year - b.year || a.month - b.month)[0];
}

export interface SyncResult {
  created: string[];
  skipped: number;
  reason?: string;
}

/**
 * 빠진 달을 채운다.
 *
 * @param force 하루 한 번 제한을 무시한다. 사람이 버튼을 눌렀을 때 쓴다.
 */
export async function syncMissingMonthSheets(force = false): Promise<SyncResult> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) return { created: [], skipped: 0, reason: "GOOGLE_SHEET_ID 없음" };

  if (!force) {
    const last = await prisma.agentAuditLog.findFirst({
      where: { action: SYNC_ACTION },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (last && Date.now() - last.createdAt.getTime() < THROTTLE_MS) {
      return { created: [], skipped: 0, reason: "최근에 이미 확인함" };
    }
  }

  const first = await earliestMonth();
  if (!first) return { created: [], skipped: 0, reason: "재무 자료가 아직 없음" };

  // 어떤 탭이 이미 있는지 한 번만 조회한다.
  const { google } = await import("googleapis");
  const credentials = JSON.parse(
    Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_B64 ?? "", "base64").toString("utf8"),
  );
  const sheets = google.sheets({
    version: "v4",
    auth: new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    }),
  });
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  const existing = new Set(meta.data.sheets?.map((s) => s.properties?.title).filter(Boolean) as string[]);

  const now = new Date();
  const created: string[] = [];
  let skipped = 0;

  let year = first.year;
  let month = first.month;
  while (year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth() + 1)) {
    const title = `${year}.${String(month).padStart(2, "0")} 재무 관리`;
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

    // 지난 달은 이미 있으면 건드리지 않는다. 사람이 손으로 고쳐 둔 것을 덮으면
    // 안 되기 때문이다. 이번 달은 아직 쌓이는 중이라 매번 최신으로 갱신한다.
    if (existing.has(title) && !isCurrentMonth) {
      skipped += 1;
    } else {
      await addMonthSheet(spreadsheetId, await buildMonthReport(year, month));
      if (!existing.has(title)) created.push(title);
    }

    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }

  await prisma.agentAuditLog.create({
    data: {
      method: "POST",
      endpoint: "/lib/financeSheet",
      action: SYNC_ACTION,
      result: { created, skipped },
    },
  });

  return { created, skipped };
}
