import { koreanDateKey } from "@/lib/dateFormat";

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface VenueWeekRange {
  start: Date;
  endExclusive: Date;
  startDate: string;
  endDate: string;
}

function dateOnly(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 한국식 주간 KPI 기준: 월요일 00:00부터 다음 월요일 직전까지. */
export function getVenueWeekRange(input = new Date()): VenueWeekRange {
  const [year, month, day] = koreanDateKey(input).split("-").map(Number);
  const monday = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - mondayOffset);
  const startDate = dateOnly(monday);
  const lastDay = new Date(monday.getTime() + 6 * DAY_MS);
  const endExclusive = new Date(monday.getTime() + 7 * DAY_MS - KST_OFFSET_MS);
  const start = new Date(monday.getTime() - KST_OFFSET_MS);
  return { start, endExclusive, startDate, endDate: dateOnly(lastDay) };
}

export function shiftVenueWeek(rangeStart: string, offset: number) {
  const [year, month, day] = rangeStart.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offset * 7);
  return dateOnly(date);
}

export function formatVenueWeek(range: VenueWeekRange) {
  const [, startMonth, startDay] = range.startDate.split("-").map(Number);
  const [, endMonth, endDay] = range.endDate.split("-").map(Number);
  const start = `${startMonth}/${startDay}`;
  const end = `${endMonth}/${endDay}`;
  return `${start} ~ ${end}`;
}

export interface HostRegisteredSpaceKpiRow {
  registrationNumber: string;
  registeredAt: string;
  spaceName: string;
  address: string;
  spacePage: string;
  sheetRowNumber: number;
}

function sheetDateKey(value: unknown): string | null {
  const text = String(value ?? "").trim();
  const match = /^(\d{4})[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})/.exec(text);
  if (!match) return null;
  const [, rawYear, rawMonth, rawDay] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${rawYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function safeSheetUrl(value: unknown): string {
  const text = String(value ?? "").trim();
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/** Read-only row parser for the host-registration sheet; only rows dated within the selected week count. */
export function parseHostRegisteredSpaceKpiRows(
  rows: readonly (readonly unknown[])[],
  startDate: string,
  endDate: string,
): HostRegisteredSpaceKpiRow[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => String(header ?? "").trim());
  const columns = new Map(headers.map((header, index) => [header, index]));
  const required = ["등록번호", "등록일시 (한국시간)", "공간명", "상세 주소"];
  const missing = required.filter((header) => !columns.has(header));
  if (missing.length) throw new Error(`호스트 등록 공간 시트에서 필요한 열을 찾지 못했습니다: ${missing.join(", ")}`);

  const get = (row: readonly unknown[], header: string) => String(row[columns.get(header)!] ?? "").trim();
  return rows.slice(1).flatMap((row, index) => {
    const registeredAt = get(row, "등록일시 (한국시간)");
    const dateKey = sheetDateKey(registeredAt);
    const spaceName = get(row, "공간명");
    if (!dateKey || dateKey < startDate || dateKey > endDate || !spaceName) return [];
    return [{
      registrationNumber: get(row, "등록번호"),
      registeredAt,
      spaceName,
      address: get(row, "상세 주소"),
      spacePage: columns.has("공간 페이지") ? safeSheetUrl(get(row, "공간 페이지")) : "",
      sheetRowNumber: index + 2,
    }];
  });
}
