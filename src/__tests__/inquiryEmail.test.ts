import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ access: vi.fn(), send: vi.fn(), credentials: vi.fn() }));
vi.mock("googleapis", () => ({ google: { auth: { OAuth2: class { setCredentials = m.credentials; getAccessToken = m.access; } }, gmail: () => ({ users: { messages: { send: m.send } } }) } }));
vi.mock("@/lib/googleClient", () => ({ decryptFromStorage: () => "fixture-only-token" }));
import { inquiryEmailMessage, isInquiryEmailOwner } from "@/lib/inquiryEmailPolicy";
import { InquiryMailError, sendInquiryEmail } from "@/lib/inquiryEmailGmail";

describe("문의 이메일 경계와 발송 결과", () => {
  beforeEach(() => { vi.clearAllMocks(); m.access.mockResolvedValue({ token: "fixture" }); m.send.mockResolvedValue({ data: { id: "fixture-mail-id" } }); });
  it("본인만 발신 설정을 관리하고 박석영·다른 관리자·외부·봇은 제외한다", () => {
    const user = { id: "fixture", email: "dbqls110@gmail.com", role: "admin", active: true };
    expect(isInquiryEmailOwner(user)).toBe(true);
    for (const changed of [{ email: "qkrtjrdud952@gmail.com" }, { email: "other@fixture.test" }, { active: false }, { partnerId: "external" }, { isAgent: true }]) expect(isInquiryEmailOwner({ ...user, ...changed })).toBe(false);
  });
  it("수신자·링크는 고정하며 문의 본문·고객명·연락처를 입력받지 않는다", () => {
    const wire = Buffer.from(inquiryEmailMessage(`customer:${"a".repeat(64)}`), "base64url").toString();
    expect(wire).toContain("To: dbqls110@gmail.com");
    expect(wire).not.toMatch(/Bcc:|Cc:/);
    const body = Buffer.from(wire.split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString();
    expect(body).toContain("새 고객 문의"); expect(body).toContain("https://erp-system-lojo.onrender.com/inquiries");
    expect(() => inquiryEmailMessage("customer:untrusted\r\nBcc: other@fixture.test")).toThrow();
  });
  it("Gmail의 자동 전송 재시도를 끄고 성공 응답 ID를 확인한다", async () => {
    await expect(sendInquiryEmail("encrypted-fixture", "connection-check")).resolves.toBe("fixture-mail-id");
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ userId: "me" }), { timeout: 15000, retry: false });
  });
  it("긴 한글 제목은 UTF-8 문자를 자르지 않고 MIME 헤더 길이 제한에 맞춰 접는다", () => {
    const wire = Buffer.from(inquiryEmailMessage(`space-registration:${"a".repeat(64)}`), "base64url").toString();
    const words = [...wire.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)];
    expect(words.map(word => Buffer.from(word[1], "base64").toString()).join("")).toBe("[ERP] 공간 등록 문의가 접수되었습니다");
    expect(words.every(word => word[0].length <= 75)).toBe(true);
  });
  it("토큰 갱신 실패 때는 실제 메일 전송을 호출하지 않는다", async () => {
    m.access.mockRejectedValue({ response: { status: 400 }, private: "private-fixture-details" });
    await expect(sendInquiryEmail("encrypted-fixture", "connection-check")).rejects.toMatchObject({ delivery: "not_sent", code: "auth_required" });
    expect(m.send).not.toHaveBeenCalled();
  });
  it("발송 전 인증 서버의 일시 장애는 재동의가 아니라 안전한 재시도 대상으로 남긴다", async () => {
    m.access.mockRejectedValue(Error("temporary-network-fixture"));
    await expect(sendInquiryEmail("fixture", "connection-check")).rejects.toMatchObject({ delivery: "not_sent", code: "provider_unavailable" });
    expect(m.send).not.toHaveBeenCalled();
  });
  it.each([[401, "auth_required"], [403, "gmail_api_disabled"], [429, "rate_limited"], [400, "send_rejected"]])("HTTP %s의 명확한 거절은 미발송으로 분류한다", async (status, code) => {
    m.send.mockRejectedValue({ response: { status }, private: "do-not-expose" });
    await expect(sendInquiryEmail("fixture", "connection-check")).rejects.toMatchObject({ delivery: "not_sent", code });
  });
  it("403 중 사용량 제한은 API 비활성화와 구분해 안전한 재시도로 분류한다", async () => {
    m.send.mockRejectedValue({ response: { status: 403, data: { error: { errors: [{ reason: "userRateLimitExceeded" }] } } } });
    await expect(sendInquiryEmail("fixture", "connection-check")).rejects.toMatchObject({ delivery: "not_sent", code: "rate_limited" });
  });
  it.each([Error("network-token-must-not-leak"), { response: { status: 500 } }, { response: { status: 408 } }])("응답 유실·시간초과·5xx는 자동 재전송하지 않는다", async error => {
    m.send.mockRejectedValue(error);
    await expect(sendInquiryEmail("fixture", "connection-check")).rejects.toEqual(new InquiryMailError("unknown", "delivery_uncertain"));
  });
});
