import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

const { venueFindMany } = vi.hoisted(() => ({ venueFindMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { venue: { findMany: venueFindMany } },
}));

import { buildAgentContext } from "@/lib/agentContext";
import { rankVenues, type VenueLike } from "@/lib/venueMatch";
import { extractVenueQuery } from "@/lib/venueQuery";

function venue(over: Partial<VenueLike> = {}): VenueLike {
  return {
    id: "v1",
    name: "테스트 공간",
    district: "강남구",
    type: "체육관",
    capacityMin: 100,
    capacityMax: 200,
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

describe("에이전트 공간 문의 조건 추출", () => {
  it("인원과 범위 예산을 큰 값 기준으로 뽑는다", () => {
    const query = extractVenueQuery("1000명 운동회, 예산 5-600만원. 야외 잔디 운동장 우선");

    expect(query.people).toBe(1_000);
    expect(query.budget).toBe(6_000_000);
    expect(query.hours).toBeUndefined();
    expect(query.spacePreference).toBe("outdoor-first");
  });

  it("쉼표 숫자·단일 금액·시간·지역 별칭을 읽는다", () => {
    expect(extractVenueQuery("약 1,000명, 5,000,000원, 4시간, 분당 또는 고양")).toMatchObject({
      people: 1_000,
      budget: 5_000_000,
      hours: 4,
      locationDistricts: ["성남시", "고양시"],
    });
  });

  it.each([
    ["500만원", 5_000_000],
    ["5,000,000원", 5_000_000],
    ["600만", 6_000_000],
  ])("금액 표기 %s을 원 단위로 읽는다", (amount, expected) => {
    expect(extractVenueQuery(`대관비 ${amount}`).budget).toBe(expected);
  });

  it("인원 범위는 큰 쪽을 사용한다", () => {
    expect(extractVenueQuery("100~150명 운동회").people).toBe(150);
  });

  it("조건을 못 뽑아도 순위 입력을 비우지 않는다", () => {
    const query = extractVenueQuery("공간 리스트 추천");
    const { candidates } = rankVenues([venue()], query);

    expect(query.people).toBeUndefined();
    expect(query.budget).toBeUndefined();
    expect(candidates).toHaveLength(1);
  });

  it("DB 행을 후보 자료와 좌표 핀으로 바꾼다", async () => {
    venueFindMany.mockResolvedValue([
      {
        ...venue({ id: "venue-1", name: "잔디 운동장", capacityMax: 1_200, lat: 37.5, lng: 127 }),
        address: "서울 강남구",
        reserveUrl: null,
        reserveMethod: "전화문의",
      },
    ]);

    const context = await buildAgentContext("1000명 운동회 공간 리스트 추천");
    const data = context.data.venues as { total: number; shown: number; items: Array<Record<string, unknown>> };

    expect(data).toMatchObject({ total: 1, shown: 1 });
    expect(data.items[0]).toMatchObject({
      id: "venue-1",
      name: "잔디 운동장",
      price: { label: "요금 미상", trust: "unknown" },
      reserveMethod: "전화문의",
    });
    expect(context.pins).toEqual([
      { id: "venue-1", name: "잔디 운동장", lat: 37.5, lng: 127, note: "강남구 · 체육관" },
    ]);
    expect(data).not.toHaveProperty("available");
  });

  it("옛날 빈 공간 자리표시를 다시 내보내지 않는다", () => {
    const source = readFileSync(new URL("../lib/agentContext.ts", import.meta.url), "utf8");

    expect(source).not.toContain("available: false");
    expect(source).not.toContain("공간 DB 가 아직 비어 있습니다");
  });
});
