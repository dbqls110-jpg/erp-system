const DAY_MS = 24 * 60 * 60 * 1000;

export interface VenueWeekRange {
  start: Date;
  endExclusive: Date;
  startDate: string;
  endDate: string;
}

function dateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 한국식 주간 KPI 기준: 월요일 00:00부터 다음 월요일 직전까지. */
export function getVenueWeekRange(input = new Date()): VenueWeekRange {
  const start = new Date(input);
  start.setHours(0, 0, 0, 0);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  const endExclusive = new Date(start.getTime() + 7 * DAY_MS);
  const lastDay = new Date(endExclusive.getTime() - DAY_MS);
  return { start, endExclusive, startDate: dateOnly(start), endDate: dateOnly(lastDay) };
}

export function shiftVenueWeek(rangeStart: string, offset: number) {
  const [year, month, day] = rangeStart.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offset * 7);
  return dateOnly(date);
}

export function formatVenueWeek(range: VenueWeekRange) {
  const start = `${range.start.getMonth() + 1}/${range.start.getDate()}`;
  const end = `${new Date(range.endExclusive.getTime() - DAY_MS).getMonth() + 1}/${new Date(range.endExclusive.getTime() - DAY_MS).getDate()}`;
  return `${start} ~ ${end}`;
}
