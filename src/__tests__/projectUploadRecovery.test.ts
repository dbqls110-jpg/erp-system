import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: { $transaction: vi.fn(), projectUploadRecovery: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() } }, drive: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/googleDrive", () => ({ findProjectUploadInDrive: mocks.drive }));
vi.mock("@/lib/projectAmounts", () => ({ upsertQuoteAmounts: mocks.upsert }));
import { beginProjectUpload, finishProjectUpload, markProjectUploadPending, recoverProjectUploads } from "@/lib/projectUploadRecovery";

const task = { id: "task", projectId: "project", name: "내부용 견적서.xlsx", mimeType: "application/xlsx", size: 10,
  contentSha256: "0".repeat(64), createdAt: new Date("2026-10-15T00:00:00Z"), status: "pending", applyQuote: true, quoteRevenue: 100, quoteCost: 50, attempts: 0, amountsApplied: false };
function txFixture(completed = false, newer = false) {
  return { $executeRaw: vi.fn(), projectUploadRecovery: {
    findUniqueOrThrow: vi.fn().mockResolvedValue({ ...task, status: completed ? "completed" : "pending", amountsApplied: completed }), update: vi.fn(),
  }, projectFile: { findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(newer ? { id: "newer" } : null), create: vi.fn().mockResolvedValue({ id: "file" }) } };
}
beforeEach(() => { vi.clearAllMocks(); mocks.db.projectUploadRecovery.updateMany.mockResolvedValue({ count: 1 }); });

describe("프로젝트 업로드 복구", () => {
  it("Drive 전송 전 복구 ID와 금액 분석을 영속화한다", async () => {
    mocks.db.projectUploadRecovery.create.mockResolvedValue({ id: "task" });
    await beginProjectUpload({ projectId: "p", createdById: "u", name: "내부용.xlsx", size: 10, mimeType: "application/xlsx", contentSha256: "0".repeat(64) },
      { revenue: 100, cost: 50, confidence: "high", source: "spreadsheet", note: "", matchedLabels: [] });
    expect(mocks.db.projectUploadRecovery.create).toHaveBeenCalledWith({ data: expect.objectContaining({ applyQuote: true, quoteRevenue: 100, quoteCost: 50, leaseUntil: expect.any(Date) }) });
  });
  it("파일·금액·복구 완료를 같은 트랜잭션에 저장한다", async () => {
    const tx = txFixture(); mocks.db.$transaction.mockImplementation(callback => callback(tx));
    expect(await finishProjectUpload("task", { driveFileId: "drive", driveUrl: "https://drive.test", category: "견적서" })).toEqual({ amountsApplied: true });
    expect(mocks.upsert).toHaveBeenCalledWith("project", task.name, { revenue: 100, cost: 50 }, tx);
    expect(tx.projectUploadRecovery.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "completed", fileId: "file" }) }));
  });
  it("완료 후 재시도는 파일과 금액을 중복 저장하지 않는다", async () => {
    const tx = txFixture(true); mocks.db.$transaction.mockImplementation(callback => callback(tx));
    await finishProjectUpload("task", { driveFileId: "drive", driveUrl: "https://drive.test", category: null });
    expect(tx.projectFile.create).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("늦게 복구되는 이전 견적서는 최신 금액을 덮어쓰지 않는다", async () => {
    const tx = txFixture(false, true); mocks.db.$transaction.mockImplementation(callback => callback(tx));
    expect((await finishProjectUpload("task", { driveFileId: "drive", driveUrl: "https://drive.test", category: null })).amountsApplied).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("원본을 못 찾으면 삭제·재업로드하지 않고 재시도 대상으로 남긴다", async () => {
    mocks.db.projectUploadRecovery.findMany.mockResolvedValue([task]); mocks.drive.mockResolvedValue(null);
    expect(await recoverProjectUploads("project")).toEqual({ checked: 1, recovered: 0 });
    expect(mocks.db.projectUploadRecovery.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "pending", lastError: "RECOVERY_RETRY_REQUIRED" }) }));
  });
  it("서버 응답이 유실된 업로드는 태그와 원본 해시를 확인한 뒤 연결한다", async () => {
    mocks.db.projectUploadRecovery.findMany.mockResolvedValue([task]);
    mocks.drive.mockResolvedValue({ name: task.name, size: task.size, contentSha256: task.contentSha256, driveFileId: "drive", driveUrl: "https://drive.test" });
    const tx = txFixture(); mocks.db.$transaction.mockImplementation(callback => callback(tx));
    expect(await recoverProjectUploads()).toEqual({ checked: 1, recovered: 1 });
    expect(tx.projectFile.create).toHaveBeenCalledTimes(1);
  });
  it("최대 시도를 초과하면 사람 확인 대상으로 보존한다", async () => {
    mocks.db.projectUploadRecovery.findMany.mockResolvedValue([{ ...task, attempts: 7 }]); mocks.drive.mockResolvedValue(null);
    await recoverProjectUploads();
    expect(mocks.db.projectUploadRecovery.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "needs_attention" }) }));
  });
  it("다른 실행이 선점한 작업은 중복 복구하지 않는다", async () => {
    mocks.db.projectUploadRecovery.findMany.mockResolvedValue([task]); mocks.db.projectUploadRecovery.updateMany.mockResolvedValue({ count: 0 });
    await recoverProjectUploads(); expect(mocks.drive).not.toHaveBeenCalled();
  });
  it("태그·이름·크기가 같아도 원본 내용이 바뀌면 자동 연결하지 않는다", async () => {
    mocks.db.projectUploadRecovery.findMany.mockResolvedValue([task]);
    mocks.drive.mockResolvedValue({ name: task.name, size: task.size, contentSha256: "different", driveFileId: "drive", driveUrl: "https://drive.test" });
    await recoverProjectUploads(); expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
  it("응답 유실 후 pending 표시는 이미 완료된 작업을 되돌리지 않는다", async () => {
    await markProjectUploadPending("task");
    expect(mocks.db.projectUploadRecovery.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "task", status: { not: "completed" } } }));
  });
});
