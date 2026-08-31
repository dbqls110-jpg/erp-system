import type { MatchQuery } from "@/lib/venueMatch";

const SEOUL_DISTRICTS = [
  "강남구",
  "강동구",
  "강북구",
  "강서구",
  "관악구",
  "광진구",
  "구로구",
  "금천구",
  "노원구",
  "도봉구",
  "동대문구",
  "동작구",
  "마포구",
  "서대문구",
  "서초구",
  "성동구",
  "성북구",
  "송파구",
  "양천구",
  "영등포구",
  "용산구",
  "은평구",
  "종로구",
  "중구",
  "중랑구",
] as const;

const CITY_ALIASES = [
  { aliases: ["분당구", "분당"], districts: ["성남시"] },
  { aliases: ["성남시", "성남"], districts: ["성남시"] },
  { aliases: ["고양시", "고양"], districts: ["고양시"] },
  { aliases: ["수원시", "수원"], districts: ["수원시"] },
  { aliases: ["인천광역시", "인천시", "인천"], districts: ["인천시", "인천광역시"] },
  { aliases: ["용인시", "용인"], districts: ["용인시"] },
  { aliases: ["부천시", "부천"], districts: ["부천시"] },
  { aliases: ["안양시", "안양"], districts: ["안양시"] },
  { aliases: ["안산시", "안산"], districts: ["안산시"] },
  { aliases: ["화성시", "화성"], districts: ["화성시"] },
  { aliases: ["광명시", "광명"], districts: ["광명시"] },
  { aliases: ["과천시", "과천"], districts: ["과천시"] },
  { aliases: ["김포시", "김포"], districts: ["김포시"] },
  { aliases: ["하남시", "하남"], districts: ["하남시"] },
  { aliases: ["구리시", "구리"], districts: ["구리시"] },
  { aliases: ["남양주시", "남양주"], districts: ["남양주시"] },
  { aliases: ["의정부시", "의정부"], districts: ["의정부시"] },
  { aliases: ["의왕시", "의왕"], districts: ["의왕시"] },
  { aliases: ["시흥시", "시흥"], districts: ["시흥시"] },
  { aliases: ["파주시", "파주"], districts: ["파주시"] },
  { aliases: ["오산시", "오산"], districts: ["오산시"] },
  { aliases: ["군포시", "군포"], districts: ["군포시"] },
  { aliases: ["포천시", "포천"], districts: ["포천시"] },
  { aliases: ["평택시", "평택"], districts: ["평택시"] },
  { aliases: ["이천시", "이천"], districts: ["이천시"] },
  { aliases: ["양주시", "양주"], districts: ["양주시"] },
  { aliases: ["양평군", "양평"], districts: ["양평군"] },
  { aliases: ["광주시", "광주"], districts: ["광주시"] },
] as const;

const NUMBER = String.raw`\d[\d,]*`;
const RANGE_SEPARATOR = String.raw`[-~∼〜–—]`;

export type VenueSpacePreference = "outdoor-first" | "indoor-first";

/** 매칭에 쓸 조건과 DB의 지역 표기 범위를 함께 보관한다. */
export interface ExtractedVenueQuery extends MatchQuery {
  /** district 한 칸으로 표현할 수 없는 서울 전체·복수 도시 조건이다. */
  locationDistricts: string[] | null;
  /** 기존 MatchQuery가 표현하지 않는 야외/실내 우선순위다. */
  spacePreference: VenueSpacePreference | null;
}

function numberValue(raw: string): number | undefined {
  const value = Number(raw.replaceAll(",", ""));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function extractPeople(question: string): number | undefined {
  const values: number[] = [];
  const rangePattern = new RegExp(`(${NUMBER})\\s*${RANGE_SEPARATOR}\\s*(${NUMBER})\\s*명`, "g");
  for (const match of question.matchAll(rangePattern)) {
    const left = numberValue(match[1]);
    const right = numberValue(match[2]);
    if (left !== undefined) values.push(left);
    if (right !== undefined) values.push(right);
  }

  const singlePattern = new RegExp(`(${NUMBER})\\s*명`, "g");
  for (const match of question.matchAll(singlePattern)) {
    const value = numberValue(match[1]);
    if (value !== undefined) values.push(value);
  }

  return values.length > 0 ? Math.max(...values) : undefined;
}

type MoneyUnit = "원" | "만" | "만원";

function moneyToWon(raw: string, unit: MoneyUnit): number | undefined {
  const value = numberValue(raw);
  if (value === undefined) return undefined;
  return unit === "원" ? value : value * 10_000;
}

function extractBudget(question: string): number | undefined {
  const values: number[] = [];
  const rangePattern = new RegExp(
    `(${NUMBER})\\s*(만원|만|원)?\\s*${RANGE_SEPARATOR}\\s*(${NUMBER})\\s*(만원|만|원)`,
    "g",
  );

  for (const match of question.matchAll(rangePattern)) {
    const leftRaw = match[1];
    const leftUnit = match[2] as MoneyUnit | undefined;
    const rightRaw = match[3];
    const rightUnit = match[4] as MoneyUnit;
    const unit = rightUnit ?? leftUnit;
    if (!unit) continue;

    // "5-600만원"은 실제 문의에서 "500만~600만원"을 줄여 쓴 표현이다.
    const leftValue = numberValue(leftRaw);
    const rightValue = numberValue(rightRaw);
    const shorthandLeft =
      !leftUnit && unit !== "원" && leftValue !== undefined && rightValue !== undefined &&
      leftValue < 100 && rightValue >= 100
        ? leftValue * 100
        : leftValue;
    const left = shorthandLeft === undefined ? undefined : moneyToWon(String(shorthandLeft), unit);
    const right = moneyToWon(rightRaw, rightUnit);
    if (left !== undefined) values.push(left);
    if (right !== undefined) values.push(right);
  }

  const amountPattern = new RegExp(`(${NUMBER})\\s*(만원|만|원)`, "g");
  for (const match of question.matchAll(amountPattern)) {
    const value = moneyToWon(match[1], match[2] as MoneyUnit);
    if (value !== undefined) values.push(value);
  }

  return values.length > 0 ? Math.max(...values) : undefined;
}

function extractHours(question: string): number | undefined {
  const match = question.match(/(\d+(?:\.\d+)?)\s*시간/);
  if (!match) return undefined;
  const hours = Number(match[1]);
  return Number.isFinite(hours) && hours > 0 ? hours : undefined;
}

function extractDistricts(question: string): string[] | null {
  const districts = new Set<string>();
  if (question.includes("서울")) {
    SEOUL_DISTRICTS.forEach((district) => districts.add(district));
  }
  SEOUL_DISTRICTS.forEach((district) => {
    if (question.includes(district)) districts.add(district);
  });
  for (const city of CITY_ALIASES) {
    if (city.aliases.some((alias) => question.includes(alias))) {
      city.districts.forEach((district) => districts.add(district));
    }
  }

  return districts.size > 0 ? [...districts] : null;
}

function extractDayOfWeek(question: string): MatchQuery["dayOfWeek"] {
  if (/공휴일/.test(question)) return "공휴일";
  if (/일요일|일요/.test(question)) return "일";
  if (/토요일|토요/.test(question)) return "토";
  if (/평일/.test(question)) return "평일";
  return undefined;
}

function extractNeeds(question: string): MatchQuery["needs"] {
  const needs = {
    parking: /주차/.test(question),
    hvac: /냉난방|에어컨|난방/.test(question),
    beam: /빔프로젝터|프로젝터|빔/.test(question),
    sound: /음향|스피커|마이크/.test(question),
  };
  return Object.values(needs).some(Boolean) ? needs : undefined;
}

/** 자연어 행사 문의에서 공간 매칭에 필요한 값만 추출한다. */
export function extractVenueQuery(question: string): ExtractedVenueQuery {
  const locationDistricts = extractDistricts(question);
  const district = locationDistricts?.length === 1 ? locationDistricts[0] : undefined;
  const asksOutdoor = /야외|잔디|운동장|주경기장|옥외|노천|마당|필드/.test(question);
  const asksIndoor = /실내/.test(question);

  const query: ExtractedVenueQuery = {
    locationDistricts,
    spacePreference: asksOutdoor ? "outdoor-first" : asksIndoor ? "indoor-first" : null,
  };
  const people = extractPeople(question);
  const budget = extractBudget(question);
  const hours = extractHours(question);
  const dayOfWeek = extractDayOfWeek(question);
  const needs = extractNeeds(question);
  if (people !== undefined) query.people = people;
  if (budget !== undefined) query.budget = budget;
  if (hours !== undefined) query.hours = hours;
  if (dayOfWeek !== undefined) query.dayOfWeek = dayOfWeek;
  if (district !== undefined) query.district = district;
  if (needs !== undefined) query.needs = needs;
  if (/기업|회사|법인|상업|영리|프로모션|브랜드/.test(question)) query.commercial = true;

  return query;
}

/** agentContext를 직접 가져오는 코드도 순수 추출 함수를 사용할 수 있게 공개한다. */
export const extractVenueMatchQuery = extractVenueQuery;
