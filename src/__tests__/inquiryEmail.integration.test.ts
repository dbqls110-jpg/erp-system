import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ session: vi.fn(), snapshot: vi.fn(), send: vi.fn(), getToken: vi.fn(), verify: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/inquiryNotifications", () => ({ getInquiryNotificationSnapshot: m.snapshot }));
vi.mock("@/lib/inquiryEmailGmail", async original => ({ ...await original<typeof import("@/lib/inquiryEmailGmail")>(), sendInquiryEmail: m.send,
  inquiryEmailOAuthClient: () => ({ getToken: m.getToken, verifyIdToken: m.verify }) }));
import { prisma } from "@/lib/prisma";
import { deliverNewInquiryEmails, enableInquiryEmails, pauseInquiryEmails, requireInquiryEmailOwner } from "@/lib/inquiryEmail";
import { completeInquiryEmailOAuth, consumeInquiryEmailState, isInquiryEmailCallback } from "@/lib/inquiryEmailOAuth";
import { INQUIRY_EMAIL_COOKIE, INQUIRY_EMAIL_SCOPE } from "@/lib/inquiryEmailPolicy";
import { decryptFromStorage } from "@/lib/googleClient";
import { InquiryMailError } from "@/lib/inquiryEmailGmail";
import { POST } from "@/app/api/agent/inquiries/email/route";

const owner = { id: `inquiry-mail-${randomUUID()}`, email: "dbqls110@gmail.com", role: "admin", active: true };
const key = (index: number) => ({ identity: { submittedAt: `2026-11-11 15:${index}`, name: "private fixture customer", email: "private@example.test", phone: "00000000000" }, status: "문의" });
const snapshot = (count: number) => ({ inquiries: Array.from({ length: count }, (_, index) => key(index)), registrations: [], rentals: [], keys: {} });
let ready = false;
describe.skipIf(process.env.ERP_COST_DB_TEST !== "1")("실제 PostgreSQL 문의 이메일 발송 상태·동시성", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "55433" || url.pathname !== "/erp_cost_test") throw Error("Isolated database required");
    await prisma.user.create({ data: owner }); ready = true;
  });
  beforeEach(async () => {
    vi.clearAllMocks(); m.session.mockResolvedValue({ user: owner }); m.snapshot.mockResolvedValue(snapshot(1)); m.send.mockResolvedValue("fixture-message-id");
    await prisma.inquiryEmailDelivery.deleteMany(); await prisma.inquiryEmailConfig.deleteMany();
    await prisma.inquiryEmailConfig.create({ data: { id: "owner", userId: owner.id, encryptedRefreshToken: "not-a-real-credential", connectedAt: new Date() } });
  });
  afterAll(async () => {
    if (!ready) return;
    await prisma.inquiryEmailDelivery.deleteMany(); await prisma.inquiryEmailConfig.deleteMany(); await prisma.user.delete({ where: { id: owner.id } }); await prisma.$disconnect();
  });
  it("첫 연결은 과거 문의를 기준으로만 저장하고 새 문의만 한 번 발송한다", async () => {
    expect((await enableInquiryEmails()).ok).toBe(true); expect(m.send).toHaveBeenCalledTimes(1);
    m.send.mockClear(); await deliverNewInquiryEmails(); expect(m.send).not.toHaveBeenCalled();
    m.snapshot.mockResolvedValue(snapshot(2)); await deliverNewInquiryEmails(); await deliverNewInquiryEmails();
    expect(m.send).toHaveBeenCalledTimes(1);
    expect(await prisma.inquiryEmailDelivery.count({ where: { status: "sent" } })).toBe(1);
    expect(await prisma.inquiryReadReceipt.count({ where: { userId: owner.id } })).toBe(0);
  });
  it("동시 클라우드 확인 12개가 같은 문의 메일을 중복 발송하지 않는다", async () => {
    await enableInquiryEmails(); m.send.mockClear(); m.snapshot.mockResolvedValue(snapshot(2));
    await Promise.all(Array.from({ length: 12 }, () => deliverNewInquiryEmails()));
    expect(m.send).toHaveBeenCalledTimes(1); expect(await prisma.inquiryEmailDelivery.count()).toBe(2);
  });
  it("응답 유실은 uncertain에 보관하고 다음 확인에서 재전송하지 않는다", async () => {
    await enableInquiryEmails(); m.send.mockClear(); m.snapshot.mockResolvedValue(snapshot(2));
    m.send.mockRejectedValueOnce(new InquiryMailError("unknown", "delivery_uncertain"));
    expect((await deliverNewInquiryEmails()).status).toBe("needs_attention"); await deliverNewInquiryEmails();
    expect(m.send).toHaveBeenCalledTimes(1); expect(await prisma.inquiryEmailDelivery.count({ where: { status: "uncertain" } })).toBe(1);
  });
  it("명확한 발송 제한은 대기 후 재시도하며 권한 실패는 알림을 중지한다", async () => {
    await enableInquiryEmails(); m.send.mockClear(); m.snapshot.mockResolvedValue(snapshot(2));
    m.send.mockRejectedValueOnce(new InquiryMailError("not_sent", "rate_limited")); await deliverNewInquiryEmails(); await deliverNewInquiryEmails();
    expect(m.send).toHaveBeenCalledTimes(1);
    await prisma.inquiryEmailDelivery.updateMany({ where: { status: "pending" }, data: { nextAttemptAt: new Date(0) } });
    m.send.mockRejectedValueOnce(new InquiryMailError("not_sent", "auth_required")); await deliverNewInquiryEmails();
    expect((await prisma.inquiryEmailConfig.findUniqueOrThrow({ where: { id: "owner" } })).enabled).toBe(false);
  });
  it("시트 조회 실패는 기존 문의 기준을 초기화하거나 메일을 보내지 않는다", async () => {
    m.snapshot.mockRejectedValueOnce(Error("private source error"));
    expect((await enableInquiryEmails()).ok).toBe(false); expect(m.send).not.toHaveBeenCalled();
    expect((await prisma.inquiryEmailConfig.findUniqueOrThrow({ where: { id: "owner" } })).initializedAt).toBeNull();
  });
  it("박석영 또는 비활성 본인은 설정을 바꾸지 못하고 무인증 요청은 원본을 읽지 않는다", async () => {
    m.session.mockResolvedValue({ user: { ...owner, email: "qkrtjrdud952@gmail.com" } });
    await expect(requireInquiryEmailOwner()).rejects.toThrow("권한");
    m.session.mockResolvedValue({ user: owner }); await prisma.user.update({ where: { id: owner.id }, data: { active: false } });
    await expect(requireInquiryEmailOwner()).rejects.toThrow("권한");
    await prisma.user.update({ where: { id: owner.id }, data: { active: true } });
    expect((await POST(new Request("https://erp.fixture/api/agent/inquiries/email", { method: "POST" }))).status).toBe(401);
    expect(m.snapshot).not.toHaveBeenCalled();
  });
  it("OAuth 상태는 본인·쿠키·만료를 확인하고 동시에 한 번만 소비한다", async () => {
    const state = `inquiry-email:${randomUUID()}`;
    await prisma.inquiryEmailConfig.update({ where: { id: "owner" }, data: { oauthStateHash: createHash("sha256").update(state).digest("hex"), oauthExpiresAt: new Date(Date.now() + 60000) } });
    expect(await consumeInquiryEmailState(state, "wrong-cookie", owner.id)).toBe(false);
    expect(await consumeInquiryEmailState(state, state, "wrong-owner")).toBe(false);
    const results = await Promise.all(Array.from({ length: 12 }, () => consumeInquiryEmailState(state, state, owner.id)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it("Gmail callback만 분기하고 검증한 토큰은 암호화 저장하며 Drive 토큰은 건드리지 않는다", async () => {
    const state = `inquiry-email:${randomUUID()}`;
    const fixtureToken = "fixture-never-real-gmail-token";
    await prisma.inquiryEmailConfig.update({ where: { id: "owner" }, data: { oauthStateHash: createHash("sha256").update(state).digest("hex"), oauthExpiresAt: new Date(Date.now() + 60000) } });
    m.getToken.mockResolvedValue({ tokens: { id_token: fixtureToken, refresh_token: fixtureToken, scope: INQUIRY_EMAIL_SCOPE } });
    m.verify.mockResolvedValue({ getPayload: () => ({ email: owner.email, email_verified: true }) });
    const req = new NextRequest(`https://erp.fixture/api/admin/drive-callback?code=fixture-code&state=${encodeURIComponent(state)}`, { headers: { cookie: `${INQUIRY_EMAIL_COOKIE}=${state}` } });
    expect(isInquiryEmailCallback(req)).toBe(true);
    expect(isInquiryEmailCallback(new NextRequest("https://erp.fixture/api/admin/drive-callback?code=legacy-drive-fixture"))).toBe(false);
    const result = await completeInquiryEmailOAuth(req);
    expect(result.headers.get("Location")).toBe("https://erp-system-lojo.onrender.com/inquiries?mail=enabled");
    const stored = await prisma.inquiryEmailConfig.findUniqueOrThrow({ where: { id: "owner" } });
    expect(stored.encryptedRefreshToken).not.toBe(fixtureToken);
    expect(decryptFromStorage(stored.encryptedRefreshToken ?? "")).toBe(fixtureToken);
    expect(stored.enabled).toBe(true);
    expect((await result.text())).not.toContain(fixtureToken);
    expect(await prisma.agentAuditLog.count({ where: { action: "drive_oauth_active" } })).toBe(0);
  });
  it("OAuth 상태 만료와 다른 Google 계정은 기존 토큰을 교체하지 않는다", async () => {
    const state = `inquiry-email:${randomUUID()}`;
    const fixtureToken = "fixture-never-real-token";
    await prisma.inquiryEmailConfig.update({ where: { id: "owner" }, data: { oauthStateHash: createHash("sha256").update(state).digest("hex"), oauthExpiresAt: new Date(0) } });
    expect(await consumeInquiryEmailState(state, state, owner.id)).toBe(false);
    await prisma.inquiryEmailConfig.update({ where: { id: "owner" }, data: { oauthExpiresAt: new Date(Date.now() + 60000) } });
    m.getToken.mockResolvedValue({ tokens: { id_token: fixtureToken, refresh_token: fixtureToken, scope: INQUIRY_EMAIL_SCOPE } });
    m.verify.mockResolvedValue({ getPayload: () => ({ email: "other@fixture.test", email_verified: true }) });
    const result = await completeInquiryEmailOAuth(new NextRequest(`https://erp.fixture/api/admin/drive-callback?code=fixture-code&state=${encodeURIComponent(state)}`, { headers: { cookie: `${INQUIRY_EMAIL_COOKIE}=${state}` } }));
    expect(result.headers.get("Location")).toContain("mail=connection-failed");
    expect((await prisma.inquiryEmailConfig.findUniqueOrThrow({ where: { id: "owner" } })).encryptedRefreshToken).toBe("not-a-real-credential");
  });
  it("알림을 끄는 동안 진행 중이던 활성화 결과가 설정을 다시 켜지 못한다", async () => {
    let release: () => void = () => undefined;
    let signal: () => void = () => undefined;
    const begun = new Promise<void>(resolve => { signal = resolve; });
    m.send.mockImplementationOnce(() => { signal(); return new Promise<string>(resolve => { release = () => resolve("fixture"); }); });
    const enabling = enableInquiryEmails(); await begun; await pauseInquiryEmails(); release(); await enabling;
    expect((await prisma.inquiryEmailConfig.findUniqueOrThrow({ where: { id: "owner" } })).enabled).toBe(false);
  });
});
