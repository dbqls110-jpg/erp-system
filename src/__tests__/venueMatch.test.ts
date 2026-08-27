import { describe, expect, it } from "vitest";
import { matchVenue, rankVenues, THRESHOLDS, type VenueLike } from "@/lib/venueMatch";

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
    price4h: 500_000,
    priceConfidence: "근거일치",
    priceMin: null,
    priceMax: null,
    areaM2: null,
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

describe("요금 환산 — 4시간 환산액이 기준이다", () => {
  it("7시간이면 시간에 비례해 늘린다", () => {
    // 블록으로 올림하면 5시간 행사에 8시간치를 물리게 된다(venuePrice.ts).
    expect(matchVenue(venue(), { hours: 7 }).estimate).toBe(875_000);
  });

  it("4시간이면 환산액 그대로다", () => {
    expect(matchVenue(venue(), { hours: 4 }).estimate).toBe(500_000);
  });

  it("환산액이 없으면 기준시간으로 우리가 환산한다", () => {
    const r = matchVenue(venue({ price4h: null, price: 100_000, baseHours: 1 }), { hours: 4 });
    expect(r.estimate).toBe(400_000);
  });

  it("요금을 모르면 null", () => {
    expect(matchVenue(venue({ price: null, price4h: null }), { hours: 7 }).estimate).toBeNull();
  });

  it("㎡당 단가는 총액으로 쓰지 않는다", () => {
    // 광화문광장 13원이 목록 맨 위에 올라온 원인이다.
    const r = matchVenue(venue({ price: 13, price4h: null, priceBasis: null }), { hours: 4 });
    expect(r.estimate).toBeNull();
    expect(r.warnings.join()).toContain("㎡");
  });
});

describe("요금 신뢰도가 순위에 반영된다", () => {
  it("근거 없는 싼 값이 확인된 비싼 값보다 앞서지 않는다", () => {
    const 수상한싼곳 = venue({ id: "cheap", price: 13, price4h: null, priceBasis: null, priceConfidence: null });
    const 확인된곳 = venue({ id: "sure", price4h: 400_000, priceConfidence: "근거일치", priceSource: "전화확인" });
    const { candidates } = rankVenues([수상한싼곳, 확인된곳], { people: 250, hours: 4 });
    expect(candidates[0].venue.id).toBe("sure");
  });

  it("못 믿는 요금으로는 예산 초과 제외를 하지 않는다", () => {
    // 우리가 곱해 만든 숫자 때문에 멀쩡한 공간이 사라지면 안 된다.
    const r = matchVenue(
      venue({ price: 1820, price4h: null, priceBasis: "1일, 1,820원/㎡", areaM2: 4208 }),
      { budget: 500_000, hours: 4 },
    );
    expect(r.blockers).toEqual([]);
    expect(r.warnings.join()).toContain("근거 불확실");
  });

  it("예산을 넣어도 요금 미상 공간은 후보에 남는다", () => {
    // 요금을 모르는 것은 확인할 일이지, 예산 초과가 확정된 것이 아니므로 후보에서 빼지 않는다.
    const { candidates, blocked } = rankVenues(
      [venue({ id: "unknown-price", price: null, price4h: null, priceConfidence: null })],
      { people: 250, budget: 500_000, hours: 4 },
    );

    expect(candidates.map((result) => result.venue.id)).toEqual(["unknown-price"]);
    expect(blocked).toHaveLength(0);
  });

  it("확인된 요금이 같은 조건의 요금 미상보다 앞선다", () => {
    const unknown = venue({ id: "unknown-price", price: null, price4h: null, priceConfidence: null });
    const confirmed = venue({ id: "confirmed-price", price4h: 250_000, priceConfidence: "근거일치" });
    const { candidates } = rankVenues([unknown, confirmed], { people: 300, budget: 500_000, hours: 4 });

    expect(candidates.map((result) => result.venue.id)).toEqual(["confirmed-price", "unknown-price"]);
  });

  it("정원과 지역이 좋은 요금 미상이 정원 미달 확인 요금보다 앞선다", () => {
    const unknown = venue({
      id: "right-capacity-unknown-price",
      capacityMax: 350,
      price: null,
      price4h: null,
      priceConfidence: null,
    });
    const confirmed = venue({
      id: "short-capacity-confirmed-price",
      capacityMax: 200,
      price4h: 250_000,
      priceConfidence: "근거일치",
    });
    const { candidates } = rankVenues([confirmed, unknown], { people: 350, budget: 500_000, hours: 4 });

    expect(candidates.map((result) => result.venue.id)).toEqual([
      "right-capacity-unknown-price",
      "short-capacity-confirmed-price",
    ]);
  });

  it("근거 불확실 요금이 완전 미상 요금보다 앞선다", () => {
    const unknown = venue({ id: "unknown-price", price: null, price4h: null, priceConfidence: null });
    const unreliable = venue({ id: "unreliable-price", price4h: 250_000, priceConfidence: "근거불일치" });
    const { candidates } = rankVenues([unknown, unreliable], { people: 300, budget: 500_000, hours: 4 });

    expect(candidates.map((result) => result.venue.id)).toEqual(["unreliable-price", "unknown-price"]);
  });

  it("확인된 요금이 예산을 크게 넘으면 제외한다", () => {
    const r = matchVenue(venue({ price4h: 5_000_000, priceConfidence: "근거일치" }), {
      budget: 500_000,
      hours: 4,
    });
    expect(r.blockers.join()).toContain("예산 초과");
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

  it("요청보다 정원이 많으면 정원 여유 없음 경고를 붙이지 않는다", () => {
    const r = matchVenue(venue({ capacityMax: 370 }), { people: 350 });

    expect(r.warnings.some((w) => w.includes("정원 여유 없음"))).toBe(false);
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
    const r = matchVenue(venue({ price4h: 550_000 }), {
      budget: 500_000,
      hours: 4,
    });
    expect(r.blockers).toEqual([]);
    expect(r.warnings.some((w) => w.includes("초과"))).toBe(true);
  });

  it("15% 를 넘으면 후보에서 뺀다", () => {
    const r = matchVenue(venue({ price4h: 600_000 }), {
      budget: 500_000,
      hours: 4,
    });
    expect(r.blockers.some((b) => b.includes("예산 초과"))).toBe(true);
  });

  it("경계값(정확히 15% 초과)은 통과시킨다", () => {
    const budget = 1_000_000;
    const price = budget * THRESHOLDS.budgetTolerance;
    const r = matchVenue(venue({ price4h: price }), { budget, hours: 4 });
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
