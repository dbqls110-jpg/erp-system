import { describe, expect, it } from "vitest";
import { MailboxError, mailboxErrorCode, mailboxErrorMessage } from "@/lib/mailboxErrors";

describe("메일 실패 안내는 코드만 저장하고 비밀값을 반환하지 않는다", () => {
  it.each([
    [{ response: { data: { error: { details: [{ reason: "SERVICE_DISABLED" }] } } } }, "api_disabled"],
    [{ response: { data: { error: { errors: [{ reason: "accessNotConfigured" }] } } } }, "api_disabled"],
    [{ response: { data: { error: { details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } } } }, "permission_missing"],
    [{ response: { status: 401 } }, "reauthorize"],
    [{ response: { data: { error: "invalid_grant" } } }, "reauthorize"],
    [{ authenticationFailed: true }, "authentication_failed"],
    [{ code: "ETIMEDOUT" }, "connection_timeout"],
    [Error("mailbox_label_missing"), "label_missing"],
  ])("제공자 오류를 안전한 분류로 바꾼다", (error, code) => { expect(mailboxErrorCode(error)).toBe(code); });
  it("허용되지 않은 진단·토큰·메일 주소를 안내에 복사하지 않는다", () => {
    const code = mailboxErrorCode({ message: "secret-access-token and private@example.invalid", response: { data: { error: "sensitive diagnostic" } } });
    expect(code).toBe("connection_failed");
    expect(mailboxErrorMessage(code)).not.toMatch(/token|private|sensitive/);
  });
  it("연결 실패와 라벨 없음·API 비활성을 구분한다", () => {
    expect(mailboxErrorCode(new MailboxError("label_missing"))).toBe("label_missing");
    expect(mailboxErrorMessage("label_missing")).toContain("라벨을 찾지");
    expect(mailboxErrorMessage("api_disabled")).toContain("Gmail API");
    expect(mailboxErrorMessage("connection_failed", "naver")).toContain("IMAP");
  });
});
