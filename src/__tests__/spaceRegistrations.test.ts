import { describe, expect, it } from "vitest";
import {
  findSpaceRegistrationRows,
  getSpaceRegistrationAge,
  parseSpaceRegistrationRows,
  spaceRegistrationStageTimestamp,
  summarizeSpaceRegistrations,
  type SpaceRegistrationIdentity,
  type SpaceRegistrationRecord,
} from "@/lib/spaceRegistrations";

const NOW = new Date("2026-09-07T05:20:00.000Z");

function row(overrides: Record<number, string> = {}): string[] {
  const values = Array.from({ length: 28 }, () => "");
  values[0] = "REG-001";
  values[1] = "2026-09-06 14:20";
  values[3] = "홍길동";
  values[4] = "소유자";
  values[5] = "010-1234-5678";
  values[6] = "owner@example.com";
  values[7] = "마루 공간";
  Object.entries(overrides).forEach(([index, value]) => { values[Number(index)] = value; });
  return values;
}

function identity(overrides: Partial<SpaceRegistrationIdentity> = {}): SpaceRegistrationIdentity {
  return {
    registrationId: "REG-001",
    receivedAt: "2026-09-06 14:20",
    contactName: "홍길동",
    relationship: "소유자",
    phone: "010-1234-5678",
    email: "owner@example.com",
    spaceName: "마루 공간",
    ...overrides,
  };
}

function record(overrides: Partial<SpaceRegistrationRecord> = {}): SpaceRegistrationRecord {
  return {
    ...parseSpaceRegistrationRows([["접수번호"], row()])[0],
    ...overrides,
  };
}

describe("공간 등록 순수 로직", () => {
  it("빈 상태와 잘못된 상태를 접수로 판정하고 28열을 읽는다", () => {
    const parsed = parseSpaceRegistrationRows([["접수번호"], row({ 2: "알 수 없는 단계", 27: "기록" })]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].status).toBe("접수");
    expect(parsed[0].rejectedAt).toBe("기록");
    expect(parsed[0].spaceName).toBe("마루 공간");
  });

  it("접수번호가 있으면 번호로 찾고, 없으면 여러 값이 모두 일치하는 행만 찾는다", () => {
    const rows = [["접수번호", "접수일시"], row(), row({ 0: "", 7: "번호 없는 공간" })];
    expect(findSpaceRegistrationRows(rows, identity()).map((match) => match.rowNumber)).toEqual([2]);
    expect(findSpaceRegistrationRows(rows, identity({
      registrationId: "",
      spaceName: "번호 없는 공간",
    })).map((match) => match.rowNumber)).toEqual([3]);
    expect(findSpaceRegistrationRows(rows, identity({ registrationId: "없는 번호" }))).toEqual([]);
  });

  it("접수번호가 비어 있고 동일한 확인 값이 여러 행이면 쓰지 않을 후보로 남긴다", () => {
    const rows = [["접수번호"], row({ 0: "" }), row({ 0: "" })];
    const matches = findSpaceRegistrationRows(rows, identity({ registrationId: "" }));
    expect(matches).toHaveLength(2);
  });

  it("접수는 B열, 진행 단계는 해당 시작 시각을 기준으로 24시간을 넘을 때만 강조한다", () => {
    expect(getSpaceRegistrationAge(record({ status: "접수" }), NOW)).toEqual({ overdue: false, dayLabel: null });
    expect(getSpaceRegistrationAge(record({ status: "접수", receivedAt: "2026-09-06 14:19" }), NOW)).toEqual({ overdue: true, dayLabel: "2일째" });
    expect(getSpaceRegistrationAge(record({ status: "검토 중", reviewStartedAt: "2026-09-06 14:19" }), NOW).overdue).toBe(true);
    expect(getSpaceRegistrationAge(record({ status: "확인 완료", confirmationCompletedAt: "2026-09-06 14:19" }), NOW).overdue).toBe(true);
    expect(getSpaceRegistrationAge(record({ status: "등록 완료", registrationCompletedAt: "2026-09-01 10:00" }), NOW)).toEqual({ overdue: false, dayLabel: null });
    expect(getSpaceRegistrationAge(record({ status: "반려", rejectedAt: "2026-09-01 10:00" }), NOW)).toEqual({ overdue: false, dayLabel: null });
  });

  it("단계별 시각과 접수 월을 기준으로 집계한다", () => {
    const current = record({ status: "검토 중", reviewStartedAt: "2026-09-07 10:00" });
    const old = record({ status: "반려", receivedAt: "2026-08-31 10:00" });
    expect(spaceRegistrationStageTimestamp(current, "접수")).toBe("2026-09-06 14:20");
    expect(spaceRegistrationStageTimestamp(current, "검토 중")).toBe("2026-09-07 10:00");
    expect(summarizeSpaceRegistrations([current, old], "2026-09")).toEqual({
      monthKey: "2026-09",
      totalCount: 1,
      stageCounts: { "접수": 0, "검토 중": 1, "확인 완료": 0, "등록 완료": 0, "반려": 0 },
    });
  });
});
