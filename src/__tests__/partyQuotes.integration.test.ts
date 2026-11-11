import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ session: vi.fn(), reserve: vi.fn(), folder: vi.fn(), upload: vi.fn(), verify: vi.fn(), stream: vi.fn(), inquiries: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/googleDrive", () => ({ reservePartyQuoteDriveId: m.reserve, preparePartyQuoteFolder: m.folder, uploadPartyQuoteToDrive: m.upload, verifyPartyQuoteInDrive: m.verify, streamMessengerFile: m.stream }));
vi.mock("@/lib/inquirySheet", () => ({ getInquiries: m.inquiries }));
vi.mock("@/lib/spaceRegistrationSheet", () => ({ getSpaceRegistrations: async () => [] }));
vi.mock("@/lib/spaceRentalSheet", () => ({ getSpaceRentals: async () => [] }));
import { prisma } from "@/lib/prisma";
import { listPartyQuoteRows, savePartyQuote, recoverPartyQuotes } from "@/lib/partyQuotes";
import { getInquiryUnreadCounts, recordInquiryRead, invalidateInquiryNotificationSnapshot } from "@/lib/inquiryNotifications";
import { inquiryKey } from "@/lib/inquiryNotificationKeys";
import { canAccessMenu, getAccessibleMenus } from "@/lib/permissions";
import { GET } from "@/app/api/party-quotes/[id]/route";

const prefix = `party-test-${randomUUID()}`;
const role = `${prefix}-role`;
const owner = { id: `${prefix}-owner`, email: "dbqls110@gmail.com", role, active: true, partnerId: null, customerId: null, venueId: null };
const park = { ...owner, id: `${prefix}-park`, email: "qkrtjrdud952@gmail.com" };
const other = { ...owner, id: `${prefix}-other`, email: "other@fixture.test", role: "admin" };
const customer = { kind: "customer", id: `${prefix}-customer` } as const;
const partner = { kind: "partner", id: `${prefix}-partner` } as const;
const identity = { submittedAt: "2026-11-11 13:00", name: "ERP 연동 점검", email: "fixture@example.test", phone: "" };
const inquiry = inquiryKey("customer", identity);
const stored = new Set<string>();
let ready = false;
const input = (contents: string, id = randomUUID()) => {
  const data = new FormData(); data.set("uploadId", id); data.set("file", new File([`%PDF-${contents}`], "fixture.pdf", { type: "application/pdf" })); return data;
};

describe.skipIf(process.env.ERP_COST_DB_TEST !== "1")("실제 PostgreSQL 견적서·문의 확인", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "55433" || url.pathname !== "/erp_cost_test") throw Error("Isolated fixture database required");
    ready = true;
    await prisma.user.createMany({ data: [owner, park, other] });
    await prisma.menuAccess.createMany({ data: ["customers", "partners", "inquiries"].map(menuKey => ({ menuKey, levelKey: role, canView: true, canEdit: true })) });
    await prisma.customer.create({ data: { id: customer.id, name: "isolated customer" } });
    await prisma.partner.create({ data: { id: partner.id, name: "isolated partner" } });
  });
  beforeEach(async () => {
    vi.clearAllMocks(); stored.clear(); invalidateInquiryNotificationSnapshot();
    m.session.mockResolvedValue({ user: owner }); m.inquiries.mockResolvedValue([{ identity, status: "문의" }]);
    m.reserve.mockImplementation(async () => `drive-${randomUUID()}`); m.folder.mockResolvedValue("private-folder");
    m.upload.mockImplementation(async (file: { driveFileId: string }) => { stored.add(file.driveFileId); });
    m.verify.mockImplementation(async (file: { driveFileId: string }) => stored.has(file.driveFileId));
    m.stream.mockImplementation(async () => new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("%PDF-fixture")); controller.close(); } }));
    await prisma.partyQuote.deleteMany({ where: { createdById: { in: [owner.id, park.id] } } });
    await prisma.inquiryReadReceipt.deleteMany({ where: { userId: { in: [owner.id, park.id] } } });
  });
  afterAll(async () => {
    if (!ready) return;
    await prisma.partyQuote.deleteMany({ where: { createdById: { in: [owner.id, park.id] } } });
    await prisma.inquiryReadReceipt.deleteMany({ where: { userId: { in: [owner.id, park.id] } } });
    await prisma.customer.delete({ where: { id: customer.id } }); await prisma.partner.delete({ where: { id: partner.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, park.id, other.id] } } });
    await prisma.menuAccess.deleteMany({ where: { levelKey: role } }); await prisma.$disconnect();
  });

  it("견적서는 대상별로 저장하고 다운로드에서도 대상 경계를 지킨다", async () => {
    const result = await savePartyQuote(customer, input("customer-only"));
    await savePartyQuote(partner, input("partner-only"));
    expect(result.ready).toBe(true);
    const rows = await listPartyQuoteRows(customer); expect(rows).toHaveLength(1); expect(rows[0]).not.toHaveProperty("driveFileId");
    const response = await GET(new NextRequest(`https://erp.fixture/api/party-quotes/${result.id}?kind=customer&partyId=${customer.id}`), { params: Promise.resolve({ id: result.id }) });
    expect(response.status).toBe(200); expect(response.headers.get("content-disposition")).toMatch(/^attachment;/); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("%PDF-fixture");
    const wrong = await GET(new NextRequest(`https://erp.fixture/api/party-quotes/${result.id}?kind=partner&partyId=${partner.id}`), { params: Promise.resolve({ id: result.id }) });
    expect(wrong.status).toBe(404);
    m.session.mockResolvedValue({ user: { ...owner, role: "partner", partnerId: partner.id } });
    await expect(listPartyQuoteRows(customer)).rejects.toMatchObject({ status: 403 });
    expect((await GET(new NextRequest(`https://erp.fixture/api/party-quotes/${result.id}?kind=customer&partyId=${customer.id}`), { params: Promise.resolve({ id: result.id }) })).status).toBe(403);
  });
  it("동일 파일12개 동시 제출은 DB와 Drive 모두1건만 저장한다", async () => {
    await Promise.all(Array.from({ length: 12 }, () => savePartyQuote(customer, input("same-file"))));
    const rows = await prisma.partyQuote.findMany({ where: { customerId: customer.id } });
    expect(rows).toHaveLength(1); expect(rows[0].status).toBe("ready"); expect(m.upload).toHaveBeenCalledTimes(1); expect(stored.size).toBe(1);
  });
  it("Drive 성공 후 응답 유실은 저장된 ID로 복구하고 재업로드하지 않는다", async () => {
    m.upload.mockImplementationOnce(async (file: { driveFileId: string }) => { stored.add(file.driveFileId); throw Error("fixture response lost"); });
    await expect(savePartyQuote(customer, input("recoverable"))).rejects.toThrow("저장 확인");
    const pending = await prisma.partyQuote.findFirstOrThrow({ where: { customerId: customer.id } });
    expect(pending.status).toBe("needs_attention"); expect(pending.driveFileId).not.toBeNull();
    expect(await recoverPartyQuotes(customer)).toEqual({ recovered: 1, pending: 0 });
    expect((await prisma.partyQuote.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("ready");
    expect((await savePartyQuote(customer, input("recoverable"))).reused).toBe(true); expect(m.upload).toHaveBeenCalledTimes(1);
  });
  it("두 담당자의 확인 상태는 독립적이며12번 재전송해도 중복이 없다", async () => {
    expect((await getInquiryUnreadCounts()).total).toBe(1);
    await Promise.all(Array.from({ length: 12 }, () => recordInquiryRead([inquiry])));
    expect((await getInquiryUnreadCounts()).total).toBe(0);
    expect(await prisma.inquiryReadReceipt.count({ where: { userId: owner.id } })).toBe(1);
    m.session.mockResolvedValue({ user: park }); expect((await getInquiryUnreadCounts()).total).toBe(1);
    await recordInquiryRead([inquiry]); expect((await getInquiryUnreadCounts()).total).toBe(0);
  });
  it("다른 관리자는 메뉴·조회·확인 API 모두 차단된다", async () => {
    m.session.mockResolvedValue({ user: other });
    expect(await canAccessMenu(other.id, "inquiries")).toBe(false);
    expect((await getAccessibleMenus(other.id, "admin")).has("inquiries")).toBe(false);
    await expect(getInquiryUnreadCounts()).rejects.toThrow("Forbidden");
    await expect(recordInquiryRead([inquiry])).rejects.toThrow("Forbidden");
    expect(m.inquiries).not.toHaveBeenCalled(); expect(await prisma.inquiryReadReceipt.count({ where: { userId: other.id } })).toBe(0);
  });
  it("새 두 테이블은 RLS와 대상 단일 연결 제약을 적용한다", async () => {
    const rows = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('party_quotes','inquiry_read_receipts')`;
    expect(rows).toHaveLength(2); expect(rows.every(row => row.relrowsecurity)).toBe(true);
    await expect(prisma.partyQuote.create({ data: { id: randomUUID(), customerId: customer.id, partnerId: partner.id, name: "invalid.pdf", size: 5, mimeType: "application/pdf", contentSha256: "invalid", createdById: owner.id } })).rejects.toThrow();
  });
});
