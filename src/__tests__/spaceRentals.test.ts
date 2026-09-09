import { describe, expect, it } from "vitest";
import {
  findSpaceRentalRows,
  parseSpaceRentalRows,
  spaceRentalStageTimestamp,
  type SpaceRentalIdentity,
  type SpaceRentalRecord,
} from "@/lib/spaceRentals";

function row(overrides: Record<number, string> = {}): string[] {
  const values = Array.from({ length: 39 }, () => "");
  values[0] = "In";
  values[1] = "RSV-001";
  values[2] = "2026-09-06";
  values[3] = "담당자";
  values[4] = "예약자";
  values[5] = "client@example.com";
  values[6] = "원청 회사";
  values[8] = "010-1234-5678";
  values[9] = "기업 행사";
  values[10] = "가을 행사";
  values[22] = "";
  Object.entries(overrides).forEach(([index, value]) => { values[Number(index)] = value; });
  return values;
}

function identity(overrides: Partial<SpaceRentalIdentity> = {}): SpaceRentalIdentity {
  return {
    category: "In",
    reservationNumber: "RSV-001",
    email: "client@example.com",
    ...overrides,
  };
}

function record(overrides: Partial<SpaceRentalRecord> = {}): SpaceRentalRecord {
  return {
    ...parseSpaceRentalRows([["구분"], row()])[0],
    ...overrides,
  };
}

describe("공간대관 순수 로직", () => {
  it("빈 예약상태와 알 수 없는 예약상태를 문의로 읽는다", () => {
    const parsed = parseSpaceRentalRows([
      ["구분", "예약번호", "접수일"],
      row(),
      row({ 1: "RSV-002", 5: "other@example.com", 22: "알 수 없는 값" }),
    ]);

    expect(parsed.map((item) => item.status)).toEqual(["문의", "문의"]);
  });

  it("A·B·F 세 값이 모두 맞는 행만 다시 찾고 중복은 모두 남긴다", () => {
    const rows = [
      ["구분", "예약번호", "이메일"],
      row(),
      row({ 0: "Out" }),
      row({ 1: "RSV-002" }),
      row({ 5: "other@example.com" }),
    ];
    expect(findSpaceRentalRows(rows, identity()).map((match) => match.rowNumber)).toEqual([2]);

    const duplicateRows = [rows[0], row(), row()];
    expect(findSpaceRentalRows(duplicateRows, identity())).toHaveLength(2);
  });

  it("사람이 다르게 적은 O·Q 값도 숫자로 해석하지 않고 그대로 보존한다", () => {
    const values = row({ 14: "코엑스 B홀", 16: "120" });
    const parsed = parseSpaceRentalRows([["구분"], values])[0];

    expect(parsed.attendees).toBe("코엑스 B홀");
    expect(parsed.content).toBe("120");
  });

  it("AH까지만 있는 짧은 행도 AI~AM 필드를 빈 값으로 채운다", () => {
    const values = row().slice(0, 34);
    const parsed = parseSpaceRentalRows([["구분"], values])[0];

    expect(parsed).toBeDefined();
    expect(parsed.direction).toBe("");
    expect(parsed.contact1At).toBe("");
    expect(parsed.contact2At).toBe("");
    expect(parsed.closedAt).toBe("");
    expect(parsed.projectName).toBe("");
    expect(parsed.wonAt).toBe("");
  });

  it("단계별 시각은 AI·AJ·AK·AM 필드에서 읽는다", () => {
    const current = record({
      contact1At: "2026-09-07 10:00",
      contact2At: "2026-09-08 10:00",
      closedAt: "2026-09-09 10:00",
      wonAt: "2026-09-08 14:00",
    });

    expect(spaceRentalStageTimestamp(current, "1차 연락")).toBe("2026-09-07 10:00");
    expect(spaceRentalStageTimestamp(current, "2차 연락")).toBe("2026-09-08 10:00");
    expect(spaceRentalStageTimestamp(current, "성사")).toBe("2026-09-08 14:00");
    expect(spaceRentalStageTimestamp(current, "종료")).toBe("2026-09-09 10:00");
  });
});
