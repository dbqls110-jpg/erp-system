import { createHash } from "node:crypto";
import { canReviewInquiries } from "@/lib/inquiryAccess";

export const INQUIRY_EMAIL_RECIPIENT = "dbqls110@gmail.com";
export const INQUIRY_EMAIL_CONFIG_ID = "owner";
export const INQUIRY_EMAIL_CALLBACK = "https://erp-system-lojo.onrender.com/api/admin/drive-callback";
export const INQUIRY_EMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const INQUIRY_EMAIL_COOKIE = "__Host-erp-inquiry-mail";
export const INQUIRY_EMAIL_STATE_PREFIX = "inquiry-email:";
export function isInquiryEmailOwner(user: Parameters<typeof canReviewInquiries>[0]) {
  return canReviewInquiries(user) && user?.email?.trim().toLowerCase() === INQUIRY_EMAIL_RECIPIENT;
}
export function inquiryEmailCategory(itemKey: string) {
  if (/^customer:[a-f0-9]{64}$/.test(itemKey)) return "고객 문의";
  if (/^space-registration:[a-f0-9]{64}$/.test(itemKey)) return "공간 등록 문의";
  if (/^space-rental:[a-f0-9]{64}$/.test(itemKey)) return "공간 대관 문의";
  throw Error("알 수 없는 문의 종류입니다.");
}
function encodedSubject(subject: string) {
  const chunks: string[] = [];
  let current = "";
  for (const character of subject) {
    if (Buffer.byteLength(current + character, "utf8") > 36) { chunks.push(current); current = ""; }
    current += character;
  }
  if (current) chunks.push(current);
  return chunks.map(chunk => `=?UTF-8?B?${Buffer.from(chunk).toString("base64")}?=`).join("\r\n ");
}
export function inquiryEmailMessage(itemKey: string) {
  const category = itemKey === "connection-check" ? "이메일 알림 연결 점검" : inquiryEmailCategory(itemKey);
  const subject = `[ERP] ${category}${itemKey === "connection-check" ? " 완료" : "가 접수되었습니다"}`;
  const body = itemKey === "connection-check"
    ? "새 문의 이메일 알림 연결 점검입니다. 실제 예약·대관 요청이 아닙니다. 연결 시점의 기존 문의는 보내지 않습니다."
    : `새 ${category}가 접수되었습니다. 문의 내용은 ERP에 로그인하여 확인해 주세요.`;
  const messageId = createHash("sha256").update(itemKey).digest("hex");
  const raw = [
    `From: ${INQUIRY_EMAIL_RECIPIENT}`, `To: ${INQUIRY_EMAIL_RECIPIENT}`,
    `Subject: ${encodedSubject(subject)}`,
    `Message-ID: <erp-inquiry-${messageId}@erp-system-lojo.onrender.com>`,
    "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "",
    Buffer.from(`${body}\n\nERP 문의 확인: https://erp-system-lojo.onrender.com/inquiries\n\n고객 개인정보는 이 메일에 포함하지 않습니다.`).toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "",
  ].join("\r\n");
  return Buffer.from(raw).toString("base64url");
}
