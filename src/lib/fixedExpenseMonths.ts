import type { Prisma } from "@prisma/client";

export interface FixedExpensePeriod {
  startMonth: string;
  endMonth: string | null;
}

export function monthKey(year: number, month: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("유효하지 않은 달입니다.");
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

function assertMonthKey(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new Error("달은 YYYY-MM 형식이어야 합니다.");
  }
}

export function previousMonthKey(value: string) {
  assertMonthKey(value);
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

export function fixedExpenseMonthWhere(viewMonth: string): Prisma.FixedExpenseWhereInput {
  assertMonthKey(viewMonth);
  return {
    startMonth: { lte: viewMonth },
    OR: [{ endMonth: null }, { endMonth: { gte: viewMonth } }],
  };
}

export function isFixedExpenseActive(fixedExpense: FixedExpensePeriod, viewMonth: string) {
  assertMonthKey(viewMonth);
  return fixedExpense.startMonth <= viewMonth
    && (fixedExpense.endMonth === null || fixedExpense.endMonth >= viewMonth);
}

export type FixedExpenseUpdatePlan =
  | { mode: "in-place" }
  | { mode: "split"; previousEndMonth: string };

export function planFixedExpenseUpdate(
  fixedExpense: FixedExpensePeriod,
  viewMonth: string,
): FixedExpenseUpdatePlan {
  if (viewMonth < fixedExpense.startMonth) {
    throw new Error("고정비가 시작되기 전 달에서는 고칠 수 없습니다.");
  }
  if (!isFixedExpenseActive(fixedExpense, viewMonth)) {
    throw new Error("해당 달에 적용되는 고정비가 아닙니다.");
  }
  return fixedExpense.startMonth === viewMonth
    ? { mode: "in-place" }
    : { mode: "split", previousEndMonth: previousMonthKey(viewMonth) };
}

export type FixedExpenseDeletePlan =
  | { mode: "delete" }
  | { mode: "end"; previousEndMonth: string };

export function planFixedExpenseDelete(
  fixedExpense: FixedExpensePeriod,
  viewMonth: string,
): FixedExpenseDeletePlan {
  if (viewMonth < fixedExpense.startMonth) {
    throw new Error("고정비가 시작되기 전 달에서는 지울 수 없습니다.");
  }
  if (!isFixedExpenseActive(fixedExpense, viewMonth)) {
    throw new Error("해당 달에 적용되는 고정비가 아닙니다.");
  }
  return fixedExpense.startMonth === viewMonth
    ? { mode: "delete" }
    : { mode: "end", previousEndMonth: previousMonthKey(viewMonth) };
}
