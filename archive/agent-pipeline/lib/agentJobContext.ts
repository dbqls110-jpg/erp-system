export type AgentContextTopic =
  | "attendance"
  | "leave"
  | "calendar"
  | "projects"
  | "finance"
  | "users";

const TOPIC_PATTERNS: Array<[AgentContextTopic, RegExp]> = [
  ["attendance", /(출근|퇴근|근태|근무|근무시간|지각|결근)/i],
  ["leave", /(휴가|연차|반차|시간차|휴무)/i],
  ["calendar", /(일정|캘린더|스케줄|약속|행사|오늘\s*(뭐|무엇|할 일))/i],
  ["projects", /(프로젝트|사업|마감|납기|진행률|담당\s*(업무|프로젝트))/i],
  ["finance", /(비용|지출|예산|재무|경비|고정비|매출|매입)/i],
  ["users", /(직원|구성원|사용자|사람|담당자|팀원)/i],
];

export function detectAgentContextTopics(input: string): AgentContextTopic[] {
  return TOPIC_PATTERNS.filter(([, pattern]) => pattern.test(input)).map(([topic]) => topic);
}

export function getKstDateParts(now = new Date()): {
  date: string;
  year: number;
  month: number;
  monthStart: string;
  monthEnd: string;
  asOf: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const year = Number(value("year"));
  const month = Number(value("month"));
  const day = value("day");
  const monthText = String(month).padStart(2, "0");
  const date = `${year}-${monthText}-${day}`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    date,
    year,
    month,
    monthStart: `${year}-${monthText}-01`,
    monthEnd: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`,
    asOf: now.toISOString(),
  };
}

export function buildErpSourceUrl(origin: string, path: string): string {
  return new URL(path, origin).toString();
}
