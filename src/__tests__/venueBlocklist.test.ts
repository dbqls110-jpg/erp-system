/**
 * 공간 제외 목록 — 지정한 곳은 이름·주소 표기가 조금 달라도 걸러야 한다
 */
import { describe, it, expect } from "vitest";
import { addressKey, blockedReason, isBlockedVenue, normalizeVenueName, VENUE_BLOCKLIST } from "@/lib/venueBlocklist.mjs";

describe("normalizeVenueName / addressKey", () => {
  it("공백·괄호·대소문자를 무시한다", () => {
    expect(normalizeVenueName("더가베 The Gabae")).toBe("더가베thegabae");
    expect(normalizeVenueName("스테이지 엑스 성수 17 (C동)")).toBe("스테이지엑스성수17");
  });
  it("주소는 구·도로명·번호까지만 본다", () => {
    expect(addressKey("서울특별시 성동구 연무장길 96 2층")).toBe("성동구|연무장길|96");
    expect(addressKey("서울 성동구 연무장길 96")).toBe("성동구|연무장길|96");
    expect(addressKey("서울 성동구 서울숲4길 15-1")).toBe("성동구|서울숲4길|15-1");
    expect(addressKey("서울 강남구")).toBeNull();
  });
});

describe("blockedReason", () => {
  it("목록의 10곳은 전부 걸린다", () => {
    for (const b of VENUE_BLOCKLIST) {
      expect(blockedReason({ name: b.name, address: b.address })).not.toBeNull();
    }
  });
  it("이름 표기가 달라도 걸린다", () => {
    expect(isBlockedVenue({ name: "더가베", address: null })).toBe(true);
    expect(isBlockedVenue({ name: "엠엠블루 2층", address: null })).toBe(true);
    expect(isBlockedVenue({ name: "노바포탈 B홀", address: "서울 성동구 아차산로 116" })).toBe(true);
    expect(isBlockedVenue({ name: "MM성수", address: "서울특별시 성동구 연무장길 95 엠엠성수" })).toBe(true);
  });
  it("네이버 플레이스 ID 로도 걸린다", () => {
    expect(blockedReason({ name: "이름 바뀜", address: null, naverPlaceId: "2145764675" })).toContain("네이버 플레이스");
  });
  it("무관한 공간은 통과", () => {
    expect(isBlockedVenue({ name: "성수 아트홀", address: "서울 성동구 연무장길 100" })).toBe(false);
    expect(isBlockedVenue({ name: "코엑스 그랜드볼룸", address: "서울 강남구 영동대로 513" })).toBe(false);
    // 같은 도로, 다른 번지는 통과
    expect(isBlockedVenue({ name: "어딘가", address: "서울 성동구 연무장7길 18" })).toBe(false);
  });
});
