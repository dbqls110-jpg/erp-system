import { parseSheetDateTime, type InquiryRecord } from "@/lib/inquiries";
import type { SpaceRegistrationRecord } from "@/lib/spaceRegistrations";
import type { SpaceRentalRecord } from "@/lib/spaceRentals";
import type { InboxMailView } from "@/lib/privateInboxPolicy";

export type InquiryBranch = "customer" | "space-registration" | "space-rental";

export interface InquiryInboxItem {
  key: string;
  branch: InquiryBranch | "mail" | "project";
  category: string;
  title: string;
  name: string;
  email: string;
  phone: string;
  receivedAt: string;
  receivedTime: number | null;
  body: string;
  status: string;
  assignee: string;
  waitingForContact: boolean;
  completed: boolean;
}

export interface InquiryInboxSources {
  inquiries: readonly (InquiryRecord & { inboxKey?: string })[];
  registrations: readonly (SpaceRegistrationRecord & { inboxKey?: string })[];
  rentals: readonly (SpaceRentalRecord & { inboxKey?: string })[];
}

export function buildInquiryInbox({ inquiries, registrations, rentals }: InquiryInboxSources): InquiryInboxItem[] {
  return [
    ...inquiries.map(item => ({
      key: item.inboxKey ?? `customer:${item.id}`, branch: "customer", category: "고객 문의", title: item.rentalType || "고객 문의",
      name: item.name, email: item.email, phone: item.phone, receivedAt: item.submittedAt,
      receivedTime: parseSheetDateTime(item.submittedAt)?.getTime() ?? null,
      body: item.content, status: item.status, assignee: item.assignee,
      waitingForContact: item.status === "문의", completed: item.status === "성사" || item.status === "종료",
    } satisfies InquiryInboxItem)),
    ...registrations.map(item => ({
      key: item.inboxKey ?? `space-registration:${item.id}`, branch: "space-registration", category: "공간 등록", title: item.displayName || item.spaceName || "공간 등록",
      name: item.contactName, email: item.email, phone: item.phone, receivedAt: item.receivedAt,
      receivedTime: parseSheetDateTime(item.receivedAt)?.getTime() ?? null,
      body: item.description, status: item.status, assignee: item.manager,
      waitingForContact: item.status === "접수", completed: item.status === "등록 완료" || item.status === "반려",
    } satisfies InquiryInboxItem)),
    ...rentals.map(item => ({
      key: item.inboxKey ?? `space-rental:${item.id}`, branch: "space-rental", category: "공간대관", title: item.eventName || item.venue || "공간대관",
      name: item.reserverName, email: item.email, phone: item.phone, receivedAt: item.receivedAt,
      receivedTime: parseSheetDateTime(item.receivedAt)?.getTime() ?? null,
      body: item.content, status: item.status, assignee: item.assignee,
      waitingForContact: item.status === "문의", completed: item.status === "성사" || item.status === "종료",
    } satisfies InquiryInboxItem)),
  ].sort((a, b) => (b.receivedTime ?? -Infinity) - (a.receivedTime ?? -Infinity) || a.key.localeCompare(b.key));
}

export function mailToInboxItem(item: InboxMailView): InquiryInboxItem {
  return { key: `mail:${item.id}`, branch: "mail", category: item.provider === "naver" ? "네이버" : "Gmail", title: item.subject,
    name: item.senderName || item.senderEmail, email: item.senderEmail, phone: "", receivedAt: item.receivedAt,
    receivedTime: new Date(item.receivedAt).getTime(), body: item.body.replace(/<!--[\s\S]*?-->/g, "").replace(/\n[\t ]*\n(?:[\t ]*\n)+/g, "\n\n").trim(), status: "수신", assignee: "나만 보기", waitingForContact: false, completed: false };
}

export function summarizeInquiryInbox(items: readonly InquiryInboxItem[], now: Date) {
  const end = now.getTime();
  const start = end - 10 * 24 * 60 * 60 * 1000;
  return {
    recent: items.filter(item => item.receivedTime !== null && item.receivedTime >= start && item.receivedTime <= end).length,
    waiting: items.filter(item => item.waitingForContact).length,
    active: items.filter(item => !item.completed).length,
    completed: items.filter(item => item.completed).length,
  };
}

export function maskInquiryContact(value: string): string {
  if (!value) return "미입력";
  const at = value.indexOf("@");
  if (at > 0) return `${value.slice(0, 1)}•••${value.slice(at)}`;
  return `${value.slice(0, 1)}•••`;
}

export function maskInquiryBody(item: Pick<InquiryInboxItem, "body" | "name" | "email" | "phone">): string {
  return [item.name, item.email, item.phone].filter(value => value.length >= 2)
    .sort((a, b) => b.length - a.length)
    .reduce((body, value) => body.split(value).join(maskInquiryContact(value)), item.body);
}
