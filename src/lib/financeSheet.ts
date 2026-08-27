import { prisma } from "@/lib/prisma";
import { addMonthSheet, type MonthReportData } from "@/lib/sheets";

/**
 * 끝난 달의 재무를 시트로 옮긴다.
 *
 * 예전에는 관리자가 /api/finance-report 를 직접 호출해야만 그 달 탭이 생겼다.
 * 아무도 부르지 않으면 아무 일도 안 일어나므로 실제로 7월과 8월이 통째로 비어
 * 있었다. 사람이 기억해서 눌러야 하는 자동화는 자동화가 아니다.
 *
 * 대상은 "끝난 달"까지다. 이번 달은 아직 지출이 쌓이는 중이라 시트로 옮기지
 * 않는다. 재무 시트는 달을 마감하고 정리하는 자료이지 실시간 현황판이 아니다.
 * 진행 중인 달은 ERP 재무 화면에서 본다.
 *
 * 빠진 달이 여러 개면 한꺼번에 채운다. 한동안 아무도 안 열어 봤더라도 다음에
 * 열었을 때 밀린 달이 전부 정리된다.
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

/**
 * 재무 시트는 달이 끝난 뒤 정리하는 자료다. 그래서 "며칠에 한 번" 같은 주기가
 * 아니라 달 단위로 판단한다. 어느 달까지 옮겼는지를 기록해 두고, 아직 안 옮긴
 * 달이 생겼을 때만 움직인다.
 *
 * 이렇게 하면 달이 바뀌고 처음 재무 페이지를 열 때 지난 달이 한 번 마감된다.
 * 그 뒤로는 같은 달 안에서 몇 번을 열어도 구글을 두드리지 않는다.
 */
function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** 마감 대상인 마지막 달 = 지난 달. 이번 달은 아직 쌓이는 중이다. */
function lastClosedMonth(now = new Date()) {
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return { year, month };
}

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
 * 아직 안 옮긴 달을 시트로 옮긴다.
 *
 * @param force 이미 마감했더라도 다시 만든다. 사람이 직접 다시 뽑을 때 쓴다.
 */
export async function syncMissingMonthSheets(force = false): Promise<SyncResult> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) return { created: [], skipped: 0, reason: "GOOGLE_SHEET_ID 없음" };

  const closed = lastClosedMonth();
  const closedKey = monthKey(closed.year, closed.month);

  if (!force) {
    const last = await prisma.agentAuditLog.findFirst({
      where: { action: SYNC_ACTION },
      orderBy: { createdAt: "desc" },
      select: { result: true },
    });
    const done = (last?.result as { closedThrough?: string } | null)?.closedThrough;
    // 지난 달까지 이미 옮겼으면 할 일이 없다. 달이 바뀌어야 다시 움직인다.
    if (done && done >= closedKey) {
      return { created: [], skipped: 0, reason: `${done} 까지 이미 마감함` };
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

  const created: string[] = [];
  let skipped = 0;

  // 자료가 있는 첫 달부터 지난 달까지. 이번 달은 넣지 않는다.
  let year = first.year;
  let month = first.month;
  while (year < closed.year || (year === closed.year && month <= closed.month)) {
    const title = `${year}.${String(month).padStart(2, "0")} 재무 관리`;

    // 이미 있는 탭은 건드리지 않는다. 마감한 달을 덮으면 사람이 손으로 고쳐 둔
    // 내용이 사라진다. 다시 뽑고 싶으면 그 탭을 지우고 force 로 돌리면 된다.
    if (existing.has(title)) {
      skipped += 1;
    } else {
      await addMonthSheet(spreadsheetId, await buildMonthReport(year, month));
      created.push(title);
    }

    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }

  await prisma.agentAuditLog.create({
    data: {
      method: "POST",
      endpoint: "/lib/financeSheet",
      action: SYNC_ACTION,
      // 어느 달까지 마감했는지를 남긴다. 다음 실행이 이 값을 보고 건너뛴다.
      result: { created, skipped, closedThrough: closedKey },
    },
  });

  return { created, skipped };
}
