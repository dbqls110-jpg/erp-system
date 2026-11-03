export interface RevenueDates {
  paidDate: string | null;
  invoiceDate: string | null;
  expectedPaymentDate: string | null;
}

export function parseRevenueDates(input: Partial<Record<keyof RevenueDates, unknown>>): RevenueDates {
  function date(value: unknown, label: string): string | null {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} 형식이 올바르지 않습니다.`);
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (year < 1900 || year > 2200 || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
      throw new Error(`${label}에 실제 존재하는 날짜를 입력해 주세요.`);
    }
    return value;
  }
  return {
    paidDate: date(input.paidDate, "실제 입금일"),
    invoiceDate: date(input.invoiceDate, "계산서 발행일"),
    expectedPaymentDate: date(input.expectedPaymentDate, "입금 예정일"),
  };
}

export function revenueDatesFromForm(form: FormData): RevenueDates {
  return parseRevenueDates({ paidDate: form.get("paidDate"), invoiceDate: form.get("invoiceDate"), expectedPaymentDate: form.get("expectedPaymentDate") });
}

export function resolveRevenueDate(dates: Partial<RevenueDates>, legacyDate?: string | null) {
  if (dates.paidDate) return { date: dates.paidDate, label: "실제 입금일" };
  if (dates.invoiceDate) return { date: dates.invoiceDate, label: "계산서 발행일" };
  if (dates.expectedPaymentDate) return { date: dates.expectedPaymentDate, label: "입금 예정일" };
  if (legacyDate) return { date: legacyDate, label: "기존 발생일" };
  return { date: null, label: "날짜 미정" };
}

export const REVENUE_DATES_MISSING = { paidDate: null, invoiceDate: null, expectedPaymentDate: null };

/** Each branch excludes higher-priority dates so a revenue is counted only once. */
export function revenueDateWhere(range: { gte: string; lt: string }) {
  return [
    { paidDate: range },
    { paidDate: null, invoiceDate: range },
    { paidDate: null, invoiceDate: null, expectedPaymentDate: range },
  ];
}
