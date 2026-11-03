import type { Session } from "next-auth";

type RevenueDateActor = Pick<Session["user"], "email" | "role" | "active">;

export function canEditRevenueDates(user: RevenueDateActor | null | undefined): boolean {
  return user?.active === true && user.role === "admin"
    && user.email?.trim().toLowerCase() === "dbqls110@gmail.com";
}

export function assertCanEditRevenueDates(user: RevenueDateActor) {
  if (!canEditRevenueDates(user)) throw new Error("매출 날짜는 지정된 본인 계정만 수정할 수 있습니다.");
}
