import { describe, expect, it } from "vitest";

import { summarizeRates } from "@/lib/partnerRateStats";

describe("파트너 단가 통계", () => {
  it("수량을 가중치로 사용해 건당 평균을 계산한다", () => {
    const [stat] = summarizeRates(
      [{ item: "포스터", amount: 100000, unit: "건당" }],
      [
        { item: "포스터", amount: 80000, unit: "건당", quantity: 1, paidOn: null },
        { item: "포스터", amount: 120000, unit: "건당", quantity: 3, paidOn: null },
      ],
    );

    expect(stat).toMatchObject({ average: 110000, count: 4, min: 80000, max: 120000, ratio: 1.1 });
  });

  it("등록 단가만 있는 항목도 결과에 포함한다", () => {
    const result = summarizeRates([{ item: "리플렛", amount: 300000, unit: "건당" }], []);

    expect(result).toEqual([
      {
        item: "리플렛",
        rate: 300000,
        unit: "건당",
        average: null,
        count: 0,
        min: null,
        max: null,
        ratio: null,
      },
    ]);
  });

  it("지급 이력만 있는 항목도 결과에 포함한다", () => {
    const result = summarizeRates([], [
      { item: "리사이징", amount: 50000, unit: "건당", quantity: 1, paidOn: "2026-08-01" },
    ]);

    expect(result).toEqual([
      {
        item: "리사이징",
        rate: null,
        unit: "건당",
        average: 50000,
        count: 1,
        min: 50000,
        max: 50000,
        ratio: null,
      },
    ]);
  });

  it("단위가 다르면 같은 작업명이어도 따로 묶는다", () => {
    const result = summarizeRates(
      [
        { item: "촬영", amount: 400000, unit: "건당" },
        { item: "촬영", amount: 100000, unit: "일당" },
      ],
      [
        { item: "촬영", amount: 450000, unit: "건당", quantity: 1, paidOn: null },
        { item: "촬영", amount: 120000, unit: "일당", quantity: 1, paidOn: null },
      ],
    );

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item: "촬영", unit: "건당", average: 450000 }),
        expect.objectContaining({ item: "촬영", unit: "일당", average: 120000 }),
      ]),
    );
  });

  it("지급 건수가 많은 순서로 정렬하고 같은 건수는 가나다순으로 정렬한다", () => {
    const result = summarizeRates([], [
      { item: "다", amount: 30000, unit: "건당", quantity: 1, paidOn: null },
      { item: "나", amount: 20000, unit: "건당", quantity: 2, paidOn: null },
      { item: "가", amount: 10000, unit: "건당", quantity: 2, paidOn: null },
    ]);

    expect(result.map((stat) => stat.item)).toEqual(["가", "나", "다"]);
  });

  it("빈 배열에서는 빈 결과를 반환한다", () => {
    expect(summarizeRates([], [])).toEqual([]);
  });
});
