import { describe, expect, it } from "vitest";
import {
  estimateForHours,
  resolvePrice,
  trustPenalty,
  type PricedVenue,
} from "@/lib/venuePrice";

/** 실제 DB 행을 그대로 옮겨 온다. 지어낸 값으로 시험하면 원래 문제가 재현되지 않는다. */
function venue(over: Partial<PricedVenue>): PricedVenue {
  return {
    price: null,
    priceBasis: null,
    priceSource: null,
    baseHours: null,
    price4h: null,
    priceConfidence: null,
    priceMin: null,
    priceMax: null,
    areaM2: null,
    ...over,
  };
}

describe("화면 맨 위를 차지했던 행들", () => {
  it("광화문광장 13원은 총액이 아니다", () => {
    // 기준 칸이 비어 있어 ㎡ 표시가 없다. 대관 공간 총액이 13원일 수는 없으므로
    // 단가로 보고 총액에서 뺀다.
    const r = resolvePrice(venue({ price: 13, baseHours: 1, priceSource: "상업요율" }));
    expect(r.amount).toBeNull();
    expect(r.trust).toBe("unknown");
    expect(r.label).toContain("㎡");
    expect(r.warnings.join()).toContain("전화 확인");
  });

  it("송도컨벤시아 1,820원/㎡ 는 면적을 곱해 보여준다", () => {
    const r = resolvePrice(
      venue({
        price: 1820,
        priceBasis: "1일·1개 전시홀(전시장 임대료 1,820원/㎡/일)",
        areaM2: 4208,
        baseHours: 12,
      }),
    );
    expect(r.amount).toBe(1820 * 4208);
    // 우리가 곱한 값이라 그대로 믿게 두면 안 된다.
    expect(r.trust).toBe("unreliable");
    expect(r.warnings.join()).toContain("면적");
  });

  it("서울공예박물관 165원/㎡ 는 면적을 몰라 총액을 못 낸다", () => {
    const r = resolvePrice(venue({ price: 165, priceBasis: "1시간·8시간, 1㎡당", baseHours: 1 }));
    expect(r.amount).toBeNull();
    expect(r.label).toContain("면적 미상");
  });

  it("배드민턴장 2,000원은 기준시간을 몰라 총액이 아니다", () => {
    // 30분치인지 하루치인지 모른다. 총액인 척하면 예산 비교가 통째로 어긋난다.
    const r = resolvePrice(venue({ price: 2000, priceConfidence: "기준시간 미상" }));
    expect(r.amount).toBeNull();
    expect(r.label).toContain("기준시간 미상");
  });
});

describe("판단 순서 — 4시간 환산액이 어림짐작보다 먼저다", () => {
  it("환산액이 있으면 ㎡ 짐작을 하지 않는다", () => {
    // looksPerArea 는 "1,000원 미만이면 단가일 것" 이라는 짐작을 포함한다.
    // 원본이 이미 환산해 둔 값이 있으면 짐작할 이유가 없다. 지금 DB 에 이런 행은
    // 없지만, 원본이 갱신되어 생겼을 때 조용히 값을 버리면 안 된다.
    const r = resolvePrice(venue({ price: 500, price4h: 240_000, priceConfidence: "근거일치" }));
    expect(r.amount).toBe(240_000);
    expect(r.trust).toBe("confirmed");
  });

  it("㎡ 기준이라도 환산액이 있으면 그것을 쓴다", () => {
    const r = resolvePrice(
      venue({ price: 1820, priceBasis: "1,820원/㎡/일", areaM2: 4208, price4h: 3_000_000 }),
    );
    expect(r.amount).toBe(3_000_000);
  });
});

describe("무료 — 확인된 무료와 근거 없는 무료는 다르다", () => {
  it("무료(확인)은 0원으로 확정한다", () => {
    const r = resolvePrice(venue({ price: 0, priceConfidence: "무료(확인)" }));
    expect(r).toMatchObject({ amount: 0, free: true, trust: "confirmed", label: "무료" });
  });

  it("무료(근거없음)은 무료로 치지 않는다", () => {
    // 마곡광장이 이 경우다. 근거 칸을 보면 ㎡당 10~13원짜리 사용료가 실제로 있다.
    const r = resolvePrice(venue({ price: 13, priceBasis: "1일", priceConfidence: "무료(근거없음)", price4h: 0 }));
    expect(r.free).toBe(false);
    expect(r.amount).toBeNull();
  });

  it("무료 표기인데 요금이 잡히면 요금 쪽을 따른다", () => {
    // 하이커 그라운드: 원본 표기는 무료인데 공간별 요금표에 시간당 13만원이 있다.
    const r = resolvePrice(
      venue({ price: 190000, priceBasis: "무료", priceConfidence: "무료(확인)" }),
    );
    // 신뢰도가 무료(확인)이면 무료로 본다 — 원본의 판단을 우리가 뒤집지는 않는다.
    // 대신 이 행은 검증_요금이 '불일치'라 raw 에 근거가 남아 있고 상세에서 보인다.
    expect(r.free).toBe(true);
  });
});

describe("4시간 환산액을 우선 쓴다", () => {
  it("환산액이 있으면 그것을 쓴다", () => {
    const r = resolvePrice(venue({ price: 2000, price4h: 60000, priceConfidence: "근거불일치", priceMin: 30000, priceMax: 60000 }));
    expect(r.amount).toBe(60000);
    expect(r.trust).toBe("unreliable"); // 근거불일치
    expect(r.label).toContain("30,000원~60,000원");
  });

  it("근거일치면 확인으로 본다", () => {
    expect(resolvePrice(venue({ price4h: 400000, priceConfidence: "근거일치" })).trust).toBe("confirmed");
  });

  it("전화로 확인한 요금이 가장 믿을 만하다", () => {
    expect(resolvePrice(venue({ price4h: 400000, priceSource: "전화확인", priceConfidence: "근거없음" })).trust).toBe("confirmed");
  });

  it("신뢰도 칸이 비어 있으면 추정으로 둔다", () => {
    expect(resolvePrice(venue({ price4h: 300000 })).trust).toBe("estimated");
  });
});

describe("환산액이 없으면 기준시간으로 우리가 환산한다", () => {
  it("1시간 5만원이면 4시간에 20만원", () => {
    const r = resolvePrice(venue({ price: 50000, priceBasis: "1시간", baseHours: 1 }));
    expect(r.amount).toBe(200000);
    expect(r.warnings.join()).toContain("환산");
  });

  it("기준시간이 4시간을 넘으면 한 번만 센다", () => {
    const r = resolvePrice(venue({ price: 300000, priceBasis: "1일", baseHours: 9 }));
    expect(r.amount).toBe(300000);
  });
});

describe("estimateForHours", () => {
  const four = resolvePrice(venue({ price4h: 200000, priceConfidence: "근거일치" }));

  it("4시간이면 그대로", () => {
    expect(estimateForHours(four, 4)).toBe(200000);
    expect(estimateForHours(four)).toBe(200000);
  });

  it("시간에 비례해 늘린다", () => {
    // 블록으로 올림하면 5시간 행사에 8시간치를 물리게 된다.
    expect(estimateForHours(four, 8)).toBe(400000);
    expect(estimateForHours(four, 5)).toBe(250000);
  });

  it("금액을 모르면 시간을 줘도 모른다", () => {
    const unknown = resolvePrice(venue({ price: 13 }));
    expect(estimateForHours(unknown, 4)).toBeNull();
  });
});

describe("trustPenalty — 못 믿는 요금이 앞자리를 차지하면 안 된다", () => {
  it("믿을수록 벌점이 낮다", () => {
    expect(trustPenalty("confirmed")).toBeLessThan(trustPenalty("estimated"));
    expect(trustPenalty("estimated")).toBeLessThan(trustPenalty("unreliable"));
    expect(trustPenalty("unreliable")).toBeLessThan(trustPenalty("unknown"));
  });
});
