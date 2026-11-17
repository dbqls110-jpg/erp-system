import { describe, expect, it } from "vitest";
import { parseFollowUpDate, toKstInput, parseMailboxFolder, parseNaverEmail } from "@/lib/privateInboxPolicy";
import { mailToInboxItem, buildInquiryInbox } from "@/lib/inquiryInbox";

describe("개인 통합 문의함 입력 경계", () => {
  it("한국 시간으로 저장하고 임의 날짜나 존재하지 않는 날짜를 거부한다", () => {
    expect(parseFollowUpDate("")).toBeNull();
    expect(parseFollowUpDate("2026-11-13T10:00")?.toISOString()).toBe("2026-11-13T01:00:00.000Z");
    expect(toKstInput(new Date("2026-11-13T01:00:00Z"))).toBe("2026-11-13T10:00");
    for (const value of ["2026-02-30T10:00", "2026-13-01T10:00", "2026-11-13", "tomorrow", null]) expect(() => parseFollowUpDate(value)).toThrow();
  });
  it("메일함 명령 삽입과 다른 업체 자격 증명 전송을 거부한다", () => {
    expect(parseMailboxFolder(" ERP문의 ")).toBe("ERP문의");
    expect(parseNaverEmail("TEST@NAVER.COM")).toBe("test@naver.com");
    for (const value of ["", "INBOX\r\nLOGOUT", "a".repeat(101), null]) expect(() => parseMailboxFolder(value)).toThrow();
    for (const value of ["name@gmail.com", "a@naver.com.evil.invalid", "a\r\n@naver.com", "a@hanmail.net"]) expect(() => parseNaverEmail(value)).toThrow();
  });
  it("메일 수신 시간을 원본으로 쓰고 AI 내용이나 임의 담당자를 만들지 않는다", () => {
    const item = mailToInboxItem({ id: "m1", mailboxId: "a1", provider: "naver", accountEmail: "owner@naver.com", subject: "테스트", senderName: "발신인", senderEmail: "sender@example.com", body: "원문", receivedAt: "2026-11-13T01:00:00Z" });
    expect(item).toMatchObject({ key: "mail:m1", branch: "mail", category: "네이버", body: "원문", status: "수신", assignee: "나만 보기" });
    expect(item.receivedTime).toBe(new Date("2026-11-13T01:00:00Z").getTime());
    expect(buildInquiryInbox({ inquiries: [], registrations: [], rentals: [] })).toEqual([]);
  });
});
