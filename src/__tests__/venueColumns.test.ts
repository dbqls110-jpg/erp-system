/**
 * 공간 DB 원본 칸 정리 — 빈 열·중복 열·옛 스크랩 열·작업 이력 열
 */
import { describe, it, expect } from "vitest";
import { normalizeVenueRaw, WORKLOG_KEY } from "@/lib/venueColumns.mjs";

describe("normalizeVenueRaw", () => {
  it("빈 열은 버린다", () => {
    const out = normalizeVenueRaw({ 플랫폼: "", 쉐어잇중복: "", 통화내용: "", 접근제한_표준: "x", 완성도: "A" });
    expect(Object.keys(out)).toEqual(["완성도"]);
  });
  it("값이 같은 열은 하나로 — 남는 쪽이 비어 있으면 옮겨 담는다", () => {
    const out = normalizeVenueRaw({ 수용_min: "100", 주말이용: "가능", 주말이용_표준: "가능", 근거출처: "http://a", 출처URL: "http://a", 공간명: "본관", 대표공간명: "" });
    expect(out).toMatchObject({ 수용_min: "100", 주말이용: "가능", 출처URL: "http://a", 대표공간명: "본관" });
    expect(out).not.toHaveProperty("주말이용_표준");
    expect(out).not.toHaveProperty("근거출처");
    expect(out).not.toHaveProperty("공간명");
  });
  it("남는 쪽에 값이 있으면 그것을 지킨다", () => {
    const out = normalizeVenueRaw({ 공간명: "별관", 대표공간명: "본관" });
    expect(out["대표공간명"]).toBe("본관");
  });
  it("옛 스크랩 열은 원문_메모 한 칸으로 접는다", () => {
    const out = normalizeVenueRaw({ 대관비: "무료", 비고: "구분: 강당", "좌석/수용/면적": "", 유형: "강당" });
    expect(out["원문_메모"]).toBe("대관비: 무료 | 비고: 구분: 강당");
    expect(out).not.toHaveProperty("대관비");
    expect(out).not.toHaveProperty("비고");
  });
  it("작업 이력 열은 _작업로그 아래로 내린다", () => {
    const out = normalizeVenueRaw({ 탐색시도: "http://x;http://y", 검증_메모: "확인함", 접속상태: "정상", 완성도: "B", 전화_원본: "02-1", 구_전화: "" });
    expect(out[WORKLOG_KEY]).toEqual({ 탐색시도: "http://x;http://y", 검증_메모: "확인함", 접속상태: "정상", 전화_원본: "02-1" });
    expect(out).not.toHaveProperty("탐색시도");
    expect(out["완성도"]).toBe("B");
  });
  it("이미 정리된 raw 를 다시 돌려도 같다(멱등)", () => {
    const once = normalizeVenueRaw({ 대관비: "무료", 탐색시도: "u", 공간명: "별관", 주말이용: "가능", 주말이용_표준: "가능" });
    expect(normalizeVenueRaw(once)).toEqual(once);
  });
});
