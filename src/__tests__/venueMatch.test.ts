import { describe, expect, it } from "vitest";
import { estimateTotal, matchVenue, rankVenues, THRESHOLDS, type VenueLike } from "@/lib/venueMatch";

function venue(over: Partial<VenueLike> = {}): VenueLike {
  return {
    id: "v1",
    name: "테스트 공간",
    district: "강남구",
    type: "체육관",
    capacityMin: 200,
    capacityMax: 300,
    price: 500_000,
    priceBasis: "4시간",
    priceSource: "상업요율",
    baseHours: 4,
    commercialUse: "가능",
    saturday: "가능",
    sunday: "가능",
    holiday: "가능",
    hvac: "가능",
    parking: "가능",
    beam: "Y",
    sound: "Y",
    phone: "02-000-0000",
    lat: 37.5,
    lng: 127.0,
    calledAt: null,
    ...over,
  };
}

describe("estimateTotal — 기준시간 환산", () => {
  it("기준시간을 넘기면 블록 수만큼 곱한다", () => {
    // 4시간 기준 50만원짜리를 7시간 쓰면 2블록 = 100만원
    expect(estimateTotal(venue(), 7)).toBe(1_000_000);
  });

  it("기준시간 안이면 한 블록이다", () => {
    expect(estimateTotal(venue(), 3)).toBe(500_000);
  });

  it("기준시간을 모르면 환산하지 않는다", () => {
    // 모르는 값을 그럴듯한 숫자로 바꾸면 비교가 조용히 틀어진다.
    expect(estimateTotal(venue({ baseHours: null }), 7)).toBe(500_000);
  });

  it("요금을 모르면 null", () => {
    expect(estimateTotal(venue({ price: null }), 7)).toBeNull();
  });
});

describe("정원 — 완화된 규칙", () => {
  it("15% 넘게 모자라도 후보에서 빼지 않는다", () => {
    // 원래 규칙은 여기서 제외했다. 화면에서는 뒤로 밀기만 한다.
    const r = matchVenue(venue({ capacityMax: 200 }), { people: 300 });
    expect(r.blockers).toEqual([]);
    expect(r.warnings.some((w) => w.includes("100명 부족"))).toBe(true);
  });

  it("정원이 모자라면 넉넉한 곳보다 점수가 나쁘다", () => {
    const few = matchVenue(venue({ capacityMax: 200 }), { people: 300 });
    const enough = matchVenue(venue({ capacityMax: 320 }), { people: 300 });
    expect(few.score).toBeGreaterThan(enough.score);
  });

  it("295명은 300명 요청에 남고 경고가 붙는다", () => {
    const r = matchVenue(venue({ capacityMax: 295 }), { people: 300 });
    expect(r.blockers).toEqual([]);
    expect(r.warnings.some((w) => w.includes("좌석배치"))).toBe(true);
  });

  it("정원 미상은 맨 뒤로 밀리되 후보에는 남는다", () => {
    const unknown = matchVenue(venue({ capacityMin: null, capacityMax: null }), { people: 300 });
    const known = matchVenue(venue({ capacityMax: 300 }), { people: 300 });
    expect(unknown.blockers).toEqual([]);
    expect(unknown.score).toBeGreaterThan(known.score);
  });
});

describe("예산 — 완화된 규칙", () => {
  it("15% 이내 초과는 경고로 남긴다", () => {
    // 추정가는 우리가 계산한 값이라 1원 넘었다고 잘라내면 좋은 후보를 잃는다.
    const r = matchVenue(venue({ price: 550_000, baseHours: null }), {
      budget: 500_000,
      hours: 4,
    });
    expect(r.blockers).toEqual([]);
    expect(r.warnings.some((w) => w.includes("초과"))).toBe(true);
  });

  it("15% 를 넘으면 후보에서 뺀다", () => {
    const r = matchVenue(venue({ price: 600_000, baseHours: null }), {
      budget: 500_000,
      hours: 4,
    });
    expect(r.blockers.some((b) => b.includes("예산 초과"))).toBe(true);
  });

  it("경계값(정확히 15% 초과)은 통과시킨다", () => {
    const budget = 1_000_000;
    const price = budget * THRESHOLDS.budgetTolerance;
    const r = matchVenue(venue({ price, baseHours: null }), { budget, hours: 4 });
    expect(r.blockers).toEqual([]);
  });
});

describe("결격 사유", () => {
  it("영리 목적인데 영리대관 불가면 뺀다", () => {
    // 원래 규칙에서 빠져 있던 항목이다. 기업 문의의 결격 사유다.
    const r = matchVenue(venue({ commercialUse: "불가" }), { commercial: true });
    expect(r.blockers).toContain("영리 목적 대관 불가");
  });

  it("비영리 행사면 영리대관 불가여도 상관없다", () => {
    const r = matchVenue(venue({ commercialUse: "불가" }), { commercial: false });
    expect(r.blockers).toEqual([]);
  });

  it("조건부는 빼지 않고 확인하라고만 한다", () => {
    const r = matchVenue(venue({ commercialUse: "조건부" }), { commercial: true });
    expect(r.blockers).toEqual([]);
    expect(r.warnings.some((w) => w.includes("조건부"))).toBe(true);
  });

  it("토요일 불가면 토요일 요청에서 뺀다", () => {
    const r = matchVenue(venue({ saturday: "불가" }), { dayOfWeek: "토" });
    expect(r.blockers.some((b) => b.includes("대관 불가"))).toBe(true);
  });

  it("주차가 꼭 필요한데 주차 불가면 뺀다", () => {
    const r = matchVenue(venue({ parking: "주차불가" }), { needs: { parking: true } });
    expect(r.blockers).toContain("주차 불가");
  });

  it("설비 칸이 비어 있으면 없는 것이 아니라 미확인으로 다룬다", () => {
    // 빈 값은 "언급 없음"이지 "없음"이 아니다. 잘라내면 좋은 후보를 잃는다.
    const r = matchVenue(venue({ parking: null }), { needs: { parking: true } });
    expect(r.blockers).toEqual([]);
    expect(r.warnings.some((w) => w.includes("주차 정보 없음"))).toBe(true);
  });
});

describe("신뢰도", () => {
  it("전화로 확인한 곳이 공시가만 있는 곳보다 앞선다", () => {
    const called = matchVenue(venue({ priceSource: "전화확인" }), { people: 250 });
    const guessed = matchVenue(venue({ priceSource: "공시가(요율 미확정)" }), { people: 250 });
    expect(called.score).toBeLessThan(guessed.score);
  });

  it("통화 기록이 있으면 더 우대한다", () => {
    const withCall = matchVenue(venue({ calledAt: new Date() }), { people: 250 });
    const without = matchVenue(venue(), { people: 250 });
    expect(withCall.score).toBeLessThan(without.score);
  });
});

describe("rankVenues", () => {
  it("결격을 빼고 점수순으로 정렬한다", () => {
    const list = [
      venue({ id: "a", capacityMax: 300, priceSource: "공시가(요율 미확정)" }),
      venue({ id: "b", capacityMax: 300, priceSource: "전화확인" }),
      venue({ id: "c", commercialUse: "불가" }),
    ];
    const { candidates, blocked } = rankVenues(list, { people: 250, commercial: true });

    expect(candidates.map((r) => r.venue.id)).toEqual(["b", "a"]);
    expect(blocked.map((r) => r.venue.id)).toEqual(["c"]);
  });

  it("왜 빠졌는지 함께 돌려준다", () => {
    // 조건을 잘못 넣어 후보가 0이 됐을 때 이유를 볼 수 있어야 한다.
    const { candidates, blocked } = rankVenues([venue({ commercialUse: "불가" })], {
      commercial: true,
    });
    expect(candidates).toHaveLength(0);
    expect(blocked[0].blockers).toContain("영리 목적 대관 불가");
  });
});
