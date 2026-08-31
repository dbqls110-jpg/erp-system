import { describe, expect, it } from "vitest";
import { summarizeAttendance } from "@/lib/attendanceSummary";

describe("근태 요약 기준", () => {
  it("출근 기록은 퇴근 누락이어도 출근일로 센다", () => {
    const summary = summarizeAttendance([
      { clockIn: "2026-08-01T09:00:00Z", clockOut: null, workHours: null },
      { clockIn: "2026-08-02T09:00:00Z", clockOut: null, workHours: null },
      { clockIn: "2026-08-03T09:00:00Z", clockOut: "2026-08-03T18:00:00Z", workHours: 9 },
    ]);

    expect(summary).toEqual({
      workDays: 3,
      totalHours: 9,
      missingClockOut: 2,
      uncalculatedHours: 2,
      completedDays: 1,
    });
  });

  it("출근하지 않은 행은 어떤 집계에도 포함하지 않는다", () => {
    expect(summarizeAttendance([{ clockIn: null, clockOut: null, workHours: null }])).toEqual({
      workDays: 0,
      totalHours: 0,
      missingClockOut: 0,
      uncalculatedHours: 0,
      completedDays: 0,
    });
  });
});
