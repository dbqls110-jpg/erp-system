/**
 * 로그인할 때 출근을 자동으로 찍을 사람인지.
 *
 * 직원(관리자·팀장·사원)만이다. 파트너·공간 호스트·거래처 담당자는 우리 직원이 아니라
 * 출근이라는 개념이 없다 — 예전에는 승인 대기만 빼고 전부 찍어서, 파트너가 로그인하자
 * "오늘 직원 현황"에 파트너가 출근한 것으로 올라왔다.
 */
export const INTERNAL_ROLES: ReadonlySet<string> = new Set(["admin", "manager", "member", "user"]);

export interface AttendanceCandidate {
  role: string | null | undefined;
  partnerId: string | null;
  customerId: string | null;
  venueId: string | null;
}

export function shouldAutoClockIn(user: AttendanceCandidate): boolean {
  if (!user.role || !INTERNAL_ROLES.has(user.role)) return false;
  // 레벨이 직원이어도 외부 연결이 붙어 있으면 외부인이다(연결이 곧 신분).
  return user.partnerId === null && user.customerId === null && user.venueId === null;
}

/** 승인 대기였다가 방금 직원이 된 경우. 승인 전 로그인은 출근으로 안 찍혔으니 지금 찍는다. */
export function becameInternal(previousRole: string | null | undefined, user: AttendanceCandidate): boolean {
  return previousRole === "pending" && shouldAutoClockIn(user);
}
