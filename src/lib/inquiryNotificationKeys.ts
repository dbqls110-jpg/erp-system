import { createHash } from "node:crypto";
import type { InquiryIdentity } from "@/lib/inquiries";
import type { SpaceRegistrationIdentity } from "@/lib/spaceRegistrations";
import type { SpaceRentalIdentity } from "@/lib/spaceRentals";

export type InquiryBranch = "customer" | "space-registration" | "space-rental";
export type InquiryKeyGroups = Record<InquiryBranch, string[]>;
export function inquiryKey(branch: "customer", identity: InquiryIdentity): string;
export function inquiryKey(branch: "space-registration", identity: SpaceRegistrationIdentity): string;
export function inquiryKey(branch: "space-rental", identity: SpaceRentalIdentity): string;
export function inquiryKey(branch: InquiryBranch, identity: InquiryIdentity | SpaceRegistrationIdentity | SpaceRentalIdentity) {
  // 정렬·행 삽입 또는 객체 속성 순서가 변해도 같은 접수는 같은 키로 유지한다.
  const entries = Object.entries(identity).sort(([a], [b]) => a.localeCompare(b));
  return `${branch}:${createHash("sha256").update(JSON.stringify(entries)).digest("hex")}`;
}
export function parseInquiryReadKeys(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 500 || !value.every((key): key is string => typeof key === "string" && /^(customer|space-registration|space-rental):[a-f0-9]{64}$/.test(key))) {
    throw Error("문의 확인 목록이 올바르지 않습니다.");
  }
  return [...new Set(value)];
}
