import { describe, expect, it } from "vitest";
import { parseMessage } from "@/lib/messageSegments";

/** 테스트용 표 블록을 만든다. */
function fence(json: string) {
  return "```erp-table\n" + json + "\n```";
}

const VALID = JSON.stringify({
  title: "11월 27일 가능 공간",
  columns: [
    { key: "name", label: "공간명" },
    { key: "capacity", label: "수용", align: "right" },
    { key: "meal", label: "취식", missing: true },
  ],
  rows: [{ name: "구민회관", capacity: 300, meal: null }],
  notes: ["취식 가능 여부는 DB 에 없어 전화 확인이 필요합니다."],
});

describe("parseMessage", () => {
  it("표가 없는 평범한 메시지는 통째로 텍스트 한 조각이다", () => {
    const segments = parseMessage("내일 회의 3시로 미룰 수 있을까요?");
    expect(segments).toEqual([
      { kind: "text", value: "내일 회의 3시로 미룰 수 있을까요?" },
    ]);
  });

  it("표 블록을 payload 로 뽑아낸다", () => {
    const segments = parseMessage(fence(VALID));
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe("table");
    if (segments[0].kind !== "table") throw new Error("표가 아님");
    expect(segments[0].value.columns).toHaveLength(3);
    expect(segments[0].value.rows[0].name).toBe("구민회관");
  });

  it("표 앞뒤의 설명 문장을 잃지 않는다", () => {
    const segments = parseMessage("조건에 맞는 곳입니다.\n" + fence(VALID) + "\n더 필요하면 말씀 주세요.");
    expect(segments.map((s) => s.kind)).toEqual(["text", "table", "text"]);
  });

  it("표가 여러 개여도 모두 잡는다 (정규식 lastIndex 초기화 확인)", () => {
    const twice = fence(VALID) + "\n" + fence(VALID);
    // 같은 정규식 객체를 재사용하므로 연속 호출에서도 결과가 같아야 한다.
    expect(parseMessage(twice).filter((s) => s.kind === "table")).toHaveLength(2);
    expect(parseMessage(twice).filter((s) => s.kind === "table")).toHaveLength(2);
  });

  it("JSON 이 깨지면 표로 만들지 않고 원문을 그대로 남긴다", () => {
    const broken = fence('{"columns": [, "rows": []}');
    const segments = parseMessage(broken);
    expect(segments.every((s) => s.kind === "text")).toBe(true);
    // 답변이 잘려 도착해도 사용자가 원문은 볼 수 있어야 한다.
    expect(segments.map((s) => (s.kind === "text" ? s.value : "")).join("")).toBe(broken);
  });

  it("columns/rows 가 없는 JSON 은 표로 취급하지 않는다", () => {
    const segments = parseMessage(fence('{"title": "제목만 있음"}'));
    expect(segments.every((s) => s.kind === "text")).toBe(true);
  });

  it("CRLF 로 도착한 표도 인식한다", () => {
    const crlf = "```erp-table\r\n" + VALID + "\r\n```";
    expect(parseMessage(crlf).some((s) => s.kind === "table")).toBe(true);
  });

  it("빈 문자열은 조각을 만들지 않는다", () => {
    expect(parseMessage("")).toEqual([]);
  });
});
