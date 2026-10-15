import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), download: vi.fn(), analyze: vi.fn(), upsert: vi.fn(), revalidate: vi.fn(),
  file: { findUnique: vi.fn(), findFirst: vi.fn() }, amount: { findMany: vi.fn() }, transaction: vi.fn() }));
vi.mock("@/lib/actionGuards", () => ({ requireEditAccess: mocks.auth }));
vi.mock("@/lib/googleDrive", () => ({ downloadProjectQuote: mocks.download }));
vi.mock("@/lib/quoteParser", () => ({ analyzeQuoteFile: mocks.analyze }));
vi.mock("@/lib/projectAmounts", () => ({ upsertQuoteAmounts: mocks.upsert }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/prisma", () => ({ prisma: { projectFile: mocks.file, projectAmount: mocks.amount, $transaction: mocks.transaction } }));
import { previewProjectQuote, applyProjectQuote } from "@/app/actions/projectQuote";

beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "user" } });
  mocks.file.findUnique.mockResolvedValue({ id: "file", projectId: "project", name: "내부용 견적서.xlsx", driveFileId: "drive", mimeType: "application/xlsx" });
  mocks.file.findFirst.mockResolvedValue({ id: "file" }); mocks.amount.findMany.mockResolvedValue([]);
  mocks.download.mockResolvedValue(Buffer.from("quote"));
  mocks.analyze.mockResolvedValue({ revenue: 100, cost: 50, confidence: "high", note: "분석", source: "spreadsheet" });
  mocks.transaction.mockImplementation(callback => callback({ $executeRaw: vi.fn(), $queryRaw: vi.fn(), projectFile: mocks.file, projectAmount: mocks.amount }));
});

describe("저장된 견적서 재분석", () => {
  it("미리보기는 금액을 저장하거나 원본을 바꾸지 않는다", async () => {
    const preview = await previewProjectQuote("file", "project");
    expect(preview.analysis).toMatchObject({ revenue: 100, cost: 50 });
    expect(preview.before).toMatchObject({ revenue: null, cost: null });
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("확인 시 원본을 다시 읽고 금액을 트랜잭션으로 반영한다", async () => {
    const preview = await previewProjectQuote("file", "project");
    expect(await applyProjectQuote("file", "project", preview.fileDigest, preview.before.digest)).toEqual({ applied: true });
    expect(mocks.download).toHaveBeenCalledTimes(2);
    expect(mocks.upsert).toHaveBeenCalledWith("project", "내부용 견적서.xlsx", expect.objectContaining({ revenue: 100, cost: 50 }), expect.anything());
    expect(mocks.revalidate).toHaveBeenCalledWith("/company-finance");
  });
  it("미리보기 뒤 원본이 달라지면 반영을 중단한다", async () => {
    const preview = await previewProjectQuote("file", "project"); mocks.download.mockResolvedValue(Buffer.from("revised"));
    await expect(applyProjectQuote("file", "project", preview.fileDigest, preview.before.digest)).rejects.toThrow("원본 파일이 변경");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("미리보기 뒤 ERP 금액이 달라져도 덮어쓰지 않는다", async () => {
    const preview = await previewProjectQuote("file", "project"); mocks.amount.findMany.mockResolvedValue([{ id: "amount", kind: "cost", amount: 999, updatedAt: new Date() }]);
    await expect(applyProjectQuote("file", "project", preview.fileDigest, preview.before.digest)).rejects.toThrow("다른 작업에서 변경");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("판독 불가 시 기존 금액을 유지한다", async () => {
    const preview = await previewProjectQuote("file", "project"); mocks.analyze.mockResolvedValue({ revenue: null, cost: null, confidence: "none" });
    await expect(applyProjectQuote("file", "project", preview.fileDigest, preview.before.digest)).rejects.toThrow("기존 금액을 유지"); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("다른 프로젝트 파일과 구버전은 다운로드 전에 거부한다", async () => {
    await expect(previewProjectQuote("file", "other")).rejects.toThrow("해당 프로젝트");
    mocks.file.findFirst.mockResolvedValue({ id: "new-file" });
    await expect(previewProjectQuote("file", "project")).rejects.toThrow("최신 견적서"); expect(mocks.download).not.toHaveBeenCalled();
  });
  it("권한 없는 계정은 DB와 Drive에 접근하지 않는다", async () => {
    mocks.auth.mockRejectedValue(new Error("수정 권한이 없습니다"));
    await expect(previewProjectQuote("file", "project")).rejects.toThrow("수정 권한");
    expect(mocks.file.findUnique).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled();
  });
});
