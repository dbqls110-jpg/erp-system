import { describe, expect, it } from "vitest";
import { getVenueWeekRange, parseHostRegisteredSpaceKpiRows, shiftVenueWeek } from "@/lib/venueKpi";

describe("주간 공간 등록 시트 집계", () => {
  it("KST 월요일 00시부터 일요일까지 한 주로 계산한다", () => {
    const range = getVenueWeekRange(new Date("2026-09-27T16:00:00.000Z"));

    expect(range.startDate).toBe("2026-09-28");
    expect(range.endDate).toBe("2026-10-04");
    expect(range.start.toISOString()).toBe("2026-09-27T15:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-10-04T15:00:00.000Z");
    expect(shiftVenueWeek(range.startDate, -1)).toBe("2026-09-21");
  });

  it("선택한 주의 등록일시 행만 돌려주고 행 번호와 안전한 링크를 보존한다", () => {
    const result = parseHostRegisteredSpaceKpiRows([
      ["등록번호", "등록일시 (한국시간)", "공간명", "상세 주소", "공간 페이지"],
      ["V0001", "2026-09-27 23:59", "지난주 공간", "서울", ""],
      ["V0002", "2026-09-28 00:00", "이번 주 공간", "서울 성동구", "https://example.com/space/2"],
      ["V0003", "2026. 10. 04. 오후 11:59", "이번 주 끝 공간", "서울 마포구", "javascript:alert(1)"],
      ["V0004", "2026-10-05 00:00", "다음주 공간", "서울", ""],
      ["V0005", "날짜 없음", "날짜 없는 공간", "서울", ""],
    ], "2026-09-28", "2026-10-04");

    expect(result).toEqual([
      {
        registrationNumber: "V0002",
        registeredAt: "2026-09-28 00:00",
        spaceName: "이번 주 공간",
        address: "서울 성동구",
        spacePage: "https://example.com/space/2",
        sheetRowNumber: 3,
      },
      {
        registrationNumber: "V0003",
        registeredAt: "2026. 10. 04. 오후 11:59",
        spaceName: "이번 주 끝 공간",
        address: "서울 마포구",
        spacePage: "",
        sheetRowNumber: 4,
      },
    ]);
  });

  it("필수 시트 헤더가 없으면 조용히 0건으로 처리하지 않는다", () => {
    expect(() => parseHostRegisteredSpaceKpiRows([["공간명"], ["공간"]], "2026-09-28", "2026-10-04"))
      .toThrow("호스트 등록 공간 시트에서 필요한 열을 찾지 못했습니다");
  });
});
