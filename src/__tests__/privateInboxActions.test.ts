import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), sync: vi.fn(), load: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/privateInboxOAuth", () => ({ beginMailboxOAuth: vi.fn() }));
vi.mock("@/lib/privateInbox", () => ({ connectNaverMailbox: mocks.connect, getPrivateInbox: mocks.load,
  disconnectMailbox: vi.fn(), saveInboxFollowUp: vi.fn(), syncPrivateMailbox: mocks.sync }));
import { connectNaverInboxAction, syncMailboxAction } from "@/app/actions/privateInbox";
import { MailboxError } from "@/lib/mailboxErrors";

const input = { email: "test@naver.com", password: "", folder: "INBOX" };
const data = { mailboxes: [], messages: [], followUps: [] };
beforeEach(() => { vi.resetAllMocks(); mocks.load.mockResolvedValue(data); });

describe("네이버 연결 결과는 예상 실패를 React 예외로 보내지 않는다", () => {
  it("제공자 실패는 안전한 안내를 반환하며 진단 원문을 유출하지 않는다", async () => {
    mocks.connect.mockRejectedValue(Error("upstream confidential diagnostic"));
    const result = await connectNaverInboxAction(input);
    expect(result).toMatchObject({ ok: false });
    expect(result).toHaveProperty("message", expect.stringContaining("IMAP"));
    expect(JSON.stringify(result)).not.toContain("confidential");
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("인증 거부 후 다른 개인 메일 목록을 읽지 않는다", async () => {
    mocks.connect.mockRejectedValue(Error("Forbidden"));
    expect(await connectNaverInboxAction(input)).toMatchObject({ ok: false });
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("성공은 본인 메일 목록만 반환하고 홈페이지 시트를 재조회하지 않는다", async () => {
    expect(await connectNaverInboxAction(input)).toEqual({ ok: true, data });
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("연결 저장 후 조회 실패는 연결 실패와 구분해 안내한다", async () => {
    mocks.load.mockRejectedValue(Error("internal database detail"));
    expect(await connectNaverInboxAction(input)).toEqual({ ok: false, message: expect.stringContaining("연결은 저장") });
  });
  it("수신 실패도 React #441 예외 대신 원인별 안내와 안전한 목록을 반환한다", async () => {
    mocks.sync.mockRejectedValue(new MailboxError("label_missing"));
    expect(await syncMailboxAction("mine")).toEqual({ ok: false, data, message: expect.stringContaining("라벨을 찾지") });
  });
  it("수신 성공은 개인 목록을 반환하고 재조회 실패의 원문은 숨긴다", async () => {
    expect(await syncMailboxAction("mine")).toEqual({ ok: true, data });
    mocks.sync.mockRejectedValue(Error("credential-secret")); mocks.load.mockRejectedValue(Error("db-secret"));
    const result = await syncMailboxAction("mine");
    expect(result).toMatchObject({ ok: false, data: null }); expect(JSON.stringify(result)).not.toContain("secret");
  });
});
