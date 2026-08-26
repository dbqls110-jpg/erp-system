/**
 * 공간 후보를 추리고 순위를 매긴다.
 *
 * 공간 DB 세션이 터미널에서 쓰던 규칙(scripts/match.py)을 옮기되, 사장님 지시로
 * 두 군데를 완화했다. 터미널에서 혼자 훑는 것과, 화면에서 후보를 보고 고르는 것은
 * 다르다. 화면에서는 잘라내는 것보다 뒤로 미는 편이 낫다.
 *
 *   정원 85% 미만  제외 → 후순위로 밀되 경고를 붙인다
 *   예산 초과      즉시 제외 → 15% 이내는 경고, 그 이상만 제외
 *
 * 임계값은 THRESHOLDS 한 곳에 모아 두었다. 쓰면서 조정하게 될 값이라
 * 코드 여기저기에 숫자를 흩뿌리면 나중에 어디를 고쳐야 할지 알 수 없다.
 */

import {
  estimateForHours,
  resolvePrice,
  trustPenalty,
  type ResolvedPrice,
} from "@/lib/venuePrice";

export const THRESHOLDS = {
  /** 이보다 정원이 모자라면 후보에서 뺀다. 0.85 = 15% 미달까지 허용. */
  capacityFloor: 0.85,
  /** 예산을 이 비율까지 넘는 것은 경고만. 그 이상은 제외. */
  budgetTolerance: 1.15,
  /** 적합도 가중치. 낮을수록 좋은 점수다. */
  weights: { capacity: 1, trust: 1.2, price: 0.5, distance: 0.25, priceTrust: 0.9 },
} as const;

export interface VenueLike {
  id: string;
  name: string;
  district: string | null;
  type: string | null;
  capacityMin: number | null;
  capacityMax: number | null;
  price: number | null;
  priceBasis: string | null;
  priceSource: string | null;
  baseHours: number | null;
  price4h: number | null;
  priceConfidence: string | null;
  priceMin: number | null;
  priceMax: number | null;
  areaM2: number | null;
  commercialUse: string | null;
  saturday: string | null;
  sunday: string | null;
  holiday: string | null;
  hvac: string | null;
  parking: string | null;
  beam: string | null;
  sound: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  calledAt: Date | null;
}

export interface MatchQuery {
  /** 참석 인원 */
  people?: number;
  /** 예산(원). 행사 전체 대관료 기준. */
  budget?: number;
  /** 희망 요일 */
  dayOfWeek?: "평일" | "토" | "일" | "공휴일";
  /** 필요한 시간(시간 단위). 총액 환산에 쓴다. */
  hours?: number;
  /** 희망 지역(자치구) */
  district?: string;
  /** 필요한 조건 */
  needs?: { parking?: boolean; hvac?: boolean; beam?: boolean; sound?: boolean };
  /** 영리 목적 행사인지. 기업 행사면 true. */
  commercial?: boolean;
}

export interface MatchResult {
  venue: VenueLike;
  /** 낮을수록 좋다. */
  score: number;
  /** 후보에서 뺀 이유. 비어 있으면 후보다. */
  blockers: string[];
  /** 후보로 두되 확인이 필요한 점. */
  warnings: string[];
  /** 요청한 시간 기준으로 환산한 대략적인 총액. 모르면 null. */
  estimate: number | null;
  /** 요금을 어떻게 읽었는지. 화면이 금액과 함께 근거를 보여줄 수 있게 넘긴다. */
  price: ResolvedPrice;
}

function dayField(venue: VenueLike, day: MatchQuery["dayOfWeek"]) {
  if (day === "토") return venue.saturday;
  if (day === "일") return venue.sunday;
  if (day === "공휴일") return venue.holiday;
  return null; // 평일은 별도 칸이 없다. 운영시간으로 판단한다.
}

/** Y/N 칸을 본다. 빈 값은 "없음"이 아니라 "언급 없음"이므로 경고로 다룬다. */
function checkFacility(
  value: string | null,
  label: string,
  warnings: string[],
): boolean {
  if (!value) {
    warnings.push(`${label} 정보 없음 — 전화 확인 필요`);
    return true;
  }
  if (/^N$|불가|없음/.test(value)) return false;
  return true;
}

export function matchVenue(venue: VenueLike, query: MatchQuery): MatchResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // ── 정원 ────────────────────────────────────────────────
  const cap = venue.capacityMax ?? venue.capacityMin;
  let capacityScore = 1.6; // 정원 미상은 맨 뒤로

  if (query.people) {
    if (cap === null) {
      warnings.push("수용인원 미확인 — 전화 확인 필요");
    } else if (cap < query.people * THRESHOLDS.capacityFloor) {
      // 사장님 지시로 제외하지 않는다. 점수로 밀어 자연히 뒤로 가게 둔다.
      warnings.push(`정원 ${cap}명 — 요청보다 ${query.people - cap}명 부족`);
      capacityScore = 1 + ((query.people - cap) / query.people) * 3;
    } else if (cap < query.people) {
      warnings.push(`정원 ${cap}명 — ${query.people - cap}명 부족, 좌석배치 확인 필요`);
      capacityScore = 1 + ((query.people - cap) / query.people) * 3;
    } else {
      // 요청 인원 이상이면 실제로 수용 가능한 후보다. 가까운 여유를 경고로 표시하면
      // 사장님 화면에서 350명 요청·370명 공간 같은 정상 후보가 문제처럼 보인다.
      capacityScore = Math.min(0.9, ((cap - query.people) / query.people) * 0.3);
    }
  } else if (cap !== null) {
    capacityScore = 0.5;
  }

  // ── 예산 ────────────────────────────────────────────────
  const price = resolvePrice(venue);
  const estimate = estimateForHours(price, query.hours);
  warnings.push(...price.warnings);

  let priceScore = 0.5; // 요금 미상

  if (query.budget && estimate !== null) {
    const ratio = estimate / query.budget;
    if (ratio > THRESHOLDS.budgetTolerance) {
      // 못 믿는 요금으로는 후보를 자르지 않는다. ㎡당 단가를 면적으로 곱한 값처럼
      // 우리가 계산한 숫자 때문에 멀쩡한 공간이 목록에서 사라지면 안 된다.
      if (price.trust === "confirmed" || price.trust === "estimated") {
        blockers.push(`예산 초과(약 ${estimate.toLocaleString()}원)`);
      } else {
        warnings.push(`예산을 크게 넘을 수 있음(약 ${estimate.toLocaleString()}원, 근거 불확실)`);
      }
    } else if (ratio > 1) {
      // 추정가는 우리가 계산한 값이라 딱 잘라 버리지 않는다.
      warnings.push(`예산 ${(estimate - query.budget).toLocaleString()}원 초과(추정)`);
    }
    priceScore = Math.min(1, ratio);
  } else if (estimate !== null && !query.budget) {
    priceScore = 0.3;
  }

  // ── 결격 ────────────────────────────────────────────────
  // 영리대관 칸은 원래 규칙에서 빠져 있었다. 기업 행사의 결격 사유라 넣는다.
  if (query.commercial && venue.commercialUse === "불가") {
    blockers.push("영리 목적 대관 불가");
  }
  if (query.commercial && venue.commercialUse === "조건부") {
    warnings.push("영리 대관 조건부 — 조건 확인 필요");
  }

  const day = dayField(venue, query.dayOfWeek);
  if (query.dayOfWeek && query.dayOfWeek !== "평일") {
    if (day === "불가") blockers.push(`${query.dayOfWeek}요일 대관 불가`);
    else if (day === "승인필요") warnings.push(`${query.dayOfWeek}요일 승인 필요`);
    else if (!day || day === "미상") warnings.push(`${query.dayOfWeek}요일 가능 여부 미확인`);
  }

  // ── 필요 조건 ───────────────────────────────────────────
  if (query.needs?.parking && !checkFacility(venue.parking, "주차", warnings)) {
    blockers.push("주차 불가");
  }
  if (query.needs?.hvac && !checkFacility(venue.hvac, "냉난방", warnings)) {
    blockers.push("냉난방 불가");
  }
  if (query.needs?.beam) checkFacility(venue.beam, "빔", warnings);
  if (query.needs?.sound) checkFacility(venue.sound, "음향", warnings);

  // ── 신뢰도 ──────────────────────────────────────────────
  // 요금을 어디서 얻었는지가 답의 신뢰도를 좌우한다. 전화로 확인한 곳을 크게 우대한다.
  let trustScore =
    venue.priceSource === "전화확인" ? 0 :
    venue.priceSource === "상업요율" ? 0.15 :
    venue.priceSource?.startsWith("공시가") ? 0.5 : 0.7;

  if (venue.capacityMin === null) trustScore += 0.25;
  if (!venue.phone) trustScore += 0.2;
  if (venue.calledAt) trustScore = Math.max(0, trustScore - 0.4);

  // ── 거리 ────────────────────────────────────────────────
  // 원래 규칙은 자치구 인접표를 썼는데 5개 구만 채워져 있었다. 같은 구인지만 본다.
  // 좌표가 있으므로 나중에 실제 거리로 바꿀 수 있다.
  const distanceScore = !query.district ? 0 : venue.district === query.district ? 0 : 1;

  const w = THRESHOLDS.weights;
  const score =
    capacityScore * w.capacity +
    trustScore * w.trust +
    priceScore * w.price +
    distanceScore * w.distance +
    // 요금을 얼마나 믿는지를 점수에 넣는다. 이게 없으면 "13원" 처럼 검증이 덜 된
    // 값이 가장 싸 보여서 목록 맨 위를 차지한다. 실제로 그랬다.
    trustPenalty(price.trust) * w.priceTrust;

  return { venue, score: Math.round(score * 1000) / 1000, blockers, warnings, estimate, price };
}

/**
 * 후보를 점수순으로 돌려준다.
 *
 * 결격이 있는 곳은 목록에서 빼되 몇 곳이 왜 빠졌는지는 함께 돌려준다.
 * 조건을 잘못 넣어 후보가 0이 됐을 때 이유를 볼 수 있어야 한다.
 */
export function rankVenues(venues: VenueLike[], query: MatchQuery) {
  const all = venues.map((v) => matchVenue(v, query));
  const candidates = all.filter((r) => r.blockers.length === 0);
  const blocked = all.filter((r) => r.blockers.length > 0);

  candidates.sort(
    (a, b) => a.score - b.score || (a.estimate ?? Infinity) - (b.estimate ?? Infinity),
  );

  return { candidates, blocked };
}
