export interface AttendanceSummaryRecord {
  clockIn: Date | string | null;
  clockOut: Date | string | null;
  workHours?: number | null;
}

export interface AttendanceSummary {
  /** 출근 기록이 있는 날짜 수. 퇴근 여부와 관계없이 센다. */
  workDays: number;
  /** 퇴근 기록이 있어 계산된 근무시간 합계. */
  totalHours: number;
  /** 출근은 했지만 퇴근이 기록되지 않은 건수. */
  missingClockOut: number;
  /** 출근은 했지만 근무시간을 계산할 수 없는 건수. */
  uncalculatedHours: number;
  /** 근무시간까지 계산된 출근일 수. */
  completedDays: number;
}

/** 대시보드·근태 목록·직원 상세가 같은 기준을 쓰도록 집계를 한 곳에 둔다. */
export function summarizeAttendance(records: AttendanceSummaryRecord[]): AttendanceSummary {
  const attended = records.filter((record) => record.clockIn !== null);
  const calculated = attended.filter(
    (record) => typeof record.workHours === "number" && Number.isFinite(record.workHours),
  );

  return {
    workDays: attended.length,
    totalHours: calculated.reduce((sum, record) => sum + (record.workHours ?? 0), 0),
    missingClockOut: attended.filter((record) => record.clockOut === null).length,
    uncalculatedHours: attended.length - calculated.length,
    completedDays: calculated.length,
  };
}
