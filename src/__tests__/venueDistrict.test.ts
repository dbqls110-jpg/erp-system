import { beforeEach, describe, expect, it, vi } from "vitest";

const { venueFindMany } = vi.hoisted(() => ({ venueFindMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { venue: { findMany: venueFindMany } },
}));

import { buildAgentContext } from "@/lib/agentContext";
import { districtFromAddress, districtMatches, normalizeDistrictValue } from "@/lib/venueDistrict.mjs";
import { checkFacility, matchVenue, type VenueLike } from "@/lib/venueMatch";
import { resolvePrice } from "@/lib/venuePrice";
import { extractVenueQuery } from "@/lib/venueQuery";

function pricedVenue(over: Partial<VenueLike> = {}): VenueLike {
  return {
    id: "v1",
    name: "테스트 공간",
    district: "강남구",
    type: "회의실",
    capacityMin: 10,
    capacityMax: 100,
    price: null,
    priceBasis: null,
    priceSource: null,
    baseHours: null,
    price4h: null,
    priceConfidence: null,
    priceMin: null,
    priceMax: null,
    areaM2: null,
    commercialUse: null,
    saturday: null,
    sunday: null,
    holiday: null,
    hvac: null,
    parking: null,
    beam: null,
    sound: null,
    phone: null,
    lat: null,
    lng: null,
    calledAt: null,
    ...over,
  };
}

function contextVenue(over: Partial<VenueLike> = {}) {
  return {
    ...pricedVenue(over),
    address: "주소",
    reserveUrl: null,
    reserveMethod: null,
  };
}

describe("주소 → 자치구 표준화", () => {
  it.each([
    ["서울특별시   강남구 테헤란로 1", "서울 강남구"],
    ["인천광역시   연수구 센트럴로 1", "인천 연수구"],
    ["경기도 성남시 분당구 판교로 1", "경기 성남시 분당구"],
    ["경기   시흥시 정왕동 1", "경기 시흥시"],
  ])("%s → %s", (address, expected) => {
    expect(districtFromAddress(address)).toBe(expected);
  });

  it("판단할 수 없는 주소는 null을 반환한다", () => {
    expect(districtFromAddress("부산광역시 해운대구 센텀로 1")).toBeNull();
  });
});

describe("자치구 맞춤 규칙", () => {
  // 표기가 "시도 + 시군구" 한 형식이라 규칙도 하나다. 같거나, 질의로 시작하거나.
  it.each([
    ["서울 강남구", "서울 강남구", true],
    ["서울 강남구", "서울", true],
    ["경기 성남시 분당구", "경기 성남시", true],
    ["경기 성남시 분당구", "경기", true],
    ["인천 연수구", "인천", true],
    ["서울 강남구", "서울 서초구", false],
    ["경기 성남시흥구", "경기 성남시", false],
  ])("%s 에 %s 질의 → %s", (actual, requested, expected) => {
    expect(districtMatches(actual, requested)).toBe(expected);
  });

  it("접두어 없이 들어온 값을 표준형으로 올린다", () => {
    expect(normalizeDistrictValue("강남구")).toBe("서울 강남구");
    expect(normalizeDistrictValue("부천시")).toBe("경기 부천시");
    expect(normalizeDistrictValue("성남시 분당구")).toBe("경기 성남시 분당구");
    expect(normalizeDistrictValue("서울 강남구")).toBe("서울 강남구");
  });
});

describe("지역 질의", () => {
  beforeEach(() => venueFindMany.mockReset());

  it("인천 질의가 인천 연수구 행을 잡는다", async () => {
    venueFindMany.mockResolvedValue([contextVenue({ district: "인천 연수구" })]);

    const query = extractVenueQuery("인천 공간 추천");
    const context = await buildAgentContext("인천 공간 추천");
    const where = venueFindMany.mock.calls[0][0].where;

    expect(query.locationDistricts).toEqual(["인천"]);
    expect(where.OR).toContainEqual({ district: { startsWith: "인천 " } });
    expect((context.data.venues as { shown: number }).shown).toBe(1);
    expect(districtMatches("인천 연수구", query.district)).toBe(true);
  });

  it("성남 질의가 경기 성남시 분당구 행을 잡는다", async () => {
    venueFindMany.mockResolvedValue([contextVenue({ district: "경기 성남시 분당구" })]);

    const query = extractVenueQuery("성남 공간 추천");
    const context = await buildAgentContext("성남 공간 추천");
    const where = venueFindMany.mock.calls[0][0].where;

    expect(query.locationDistricts).toEqual(["경기 성남시"]);
    expect(where.OR).toContainEqual({ district: { startsWith: "경기 성남시 " } });
    expect((context.data.venues as { shown: number }).shown).toBe(1);
    expect(districtMatches("경기 성남시 분당구", query.district)).toBe(true);
  });
});

describe("새 요금 신뢰도 어휘", () => {
  it.each([
    ["확인", "confirmed"],
    ["미검증", "unreliable"],
    ["낮음", "unreliable"],
  ])("%s → %s", (confidence, trust) => {
    expect(resolvePrice(pricedVenue({ price4h: 100_000, priceConfidence: confidence })).trust).toBe(trust);
  });

  it("확인 + 최소요금 0은 기업행사 안내가 붙은 무료로 판정한다", () => {
    const result = resolvePrice(pricedVenue({ priceConfidence: "확인", priceMin: 0 }));

    expect(result).toMatchObject({
      trust: "confirmed",
      free: true,
      label: "무료 — 기업행사는 별도 확인",
    });
  });

  it("공시가는 실측 정확도를 반영해 0.2 감점을 사용한다", () => {
    const result = matchVenue(pricedVenue({ priceSource: "공시가(요율 미확정)" }), {});
    const ag = matchVenue(pricedVenue({ priceSource: "AG발굴" }), {});

    expect(result.score).toBeCloseTo(ag.score - 0.6, 5);
  });
});

describe("설비 미확인 값", () => {
  it("미확인은 빈칸처럼 경고를 남기고 후보를 통과시킨다", () => {
    const warnings: string[] = [];

    expect(checkFacility("미확인", "빔", warnings)).toBe(true);
    expect(warnings).toContain("빔 정보 없음 — 전화 확인 필요");
  });

  it("__EMPTY__도 빈칸처럼 경고를 남긴다", () => {
    const warnings: string[] = [];

    expect(checkFacility("__EMPTY__", "음향", warnings)).toBe(true);
    expect(warnings).toContain("음향 정보 없음 — 전화 확인 필요");
  });
});

describe("요금 신뢰도 어휘 함정", () => {
  it("'미확인'을 '확인'으로 잘못 읽지 않는다", () => {
    // has() 가 includes() 라 CONFIRMED 목록에 "확인" 을 넣으면 "미확인" 까지 걸린다.
    const base = {
      price: null, priceBasis: null, priceSource: null, baseHours: null,
      price4h: 500000, priceMin: null, priceMax: null, areaM2: null,
    };
    expect(resolvePrice({ ...base, priceConfidence: "확인" }).trust).toBe("confirmed");
    expect(resolvePrice({ ...base, priceConfidence: "미확인" }).trust).not.toBe("confirmed");
    expect(resolvePrice({ ...base, priceConfidence: "미검증" }).trust).toBe("unreliable");
    expect(resolvePrice({ ...base, priceConfidence: "낮음" }).trust).toBe("unreliable");
  });
});
