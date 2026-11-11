import { describe, expect, it } from "vitest";
import { parsePartyQuoteTarget, validatePartyQuote, PARTY_QUOTE_MAX_BYTES } from "@/lib/partyQuotePolicy";

describe("거래처·파트너 견적서 경계 검증", () => {
  it.each(["customer", "partner"])("유효한 대상만 받는다: %s", kind => {
    expect(parsePartyQuoteTarget({ kind, id: "party_1" })).toEqual({ kind, id: "party_1" });
  });
  it.each([null, {}, { kind: "project", id: "1" }, { kind: "customer", id: "../other" }, { kind: "partner", id: "a'b" }])("잘못된 대상을 거부한다", value => {
    expect(() => parsePartyQuoteTarget(value)).toThrow();
  });
  it.each([
    ["quote.pdf", "application/pdf", [0x25,0x50,0x44,0x46,0x2d]],
    ["quote.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [0x50,0x4b,0x03,0x04]],
    ["quote.xls", "application/vnd.ms-excel", [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]],
    ["quote.jpg", "image/jpeg", [0xff,0xd8,0xff]],
    ["quote.png", "image/png", [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]],
  ])("확장자·MIME·파일 헤더를 함께 확인한다: %s", (name, type, bytes) => {
    const buffer = Uint8Array.from(bytes);
    expect(validatePartyQuote({ name, type, size: buffer.length }, buffer)).toEqual({ name, mimeType: type });
    expect(() => validatePartyQuote({ name, type, size: 3 }, Uint8Array.from([1,2,3]))).toThrow();
  });
  it("실행 파일·경로형 이름·위조 MIME·초과 용량을 거부한다", () => {
    const buffer = Uint8Array.from([0x25,0x50,0x44,0x46,0x2d]);
    for (const file of [{ name: "x.exe", type: "application/pdf", size: 5 }, { name: "../x.pdf", type: "application/pdf", size: 5 },
      { name: "x.pdf", type: "text/html", size: 5 }, { name: "x.pdf", type: "application/pdf", size: PARTY_QUOTE_MAX_BYTES + 1 }]) {
      expect(() => validatePartyQuote(file, buffer)).toThrow();
    }
  });
});
