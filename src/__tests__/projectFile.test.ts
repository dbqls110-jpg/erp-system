import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireEditAccess,
  projectFindUnique,
  projectFileFindUnique,
  projectFileFindFirst,
  projectFileDelete,
  transaction,
  projectFileCreate,
  upsertQuoteAmounts,
  uploadFileToDrive,
  deleteFileFromDrive,
  deleteQuoteAmounts,
  isInternalQuoteFileName,
  analyzeQuoteFile,
  beginProjectUpload, finishProjectUpload, markProjectUploadPending,
  revalidatePath,
} = vi.hoisted(() => ({
  requireEditAccess: vi.fn(),
  projectFindUnique: vi.fn(),
  projectFileFindUnique: vi.fn(),
  projectFileFindFirst: vi.fn(),
  projectFileDelete: vi.fn(),
  projectFileCreate: vi.fn(),
  transaction: vi.fn(),
  upsertQuoteAmounts: vi.fn(),
  uploadFileToDrive: vi.fn(),
  deleteFileFromDrive: vi.fn(),
  deleteQuoteAmounts: vi.fn(),
  isInternalQuoteFileName: vi.fn(() => false),
  analyzeQuoteFile: vi.fn(),
  beginProjectUpload: vi.fn(), finishProjectUpload: vi.fn(), markProjectUploadPending: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/actionGuards", () => ({ requireEditAccess }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transaction,
    project: { findUnique: projectFindUnique },
    projectFile: {
      create: projectFileCreate,
      findUnique: projectFileFindUnique,
      findFirst: projectFileFindFirst,
      delete: projectFileDelete,
    },
  },
}));
vi.mock("@/lib/googleDrive", () => ({ uploadFileToDrive, deleteFileFromDrive }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/quoteParser", () => ({ analyzeQuoteFile }));
vi.mock("@/lib/quotePolicy", () => ({ isInternalQuoteFileName }));
vi.mock("@/lib/projectAmounts", () => ({ upsertQuoteAmounts, deleteQuoteAmounts }));
vi.mock("@/lib/projectUploadRecovery", () => ({ beginProjectUpload, finishProjectUpload, markProjectUploadPending, recoverProjectUploads: vi.fn() }));

import { deleteProjectFile, uploadProjectFiles } from "@/app/actions/projectFile";

const ownerAuthError = "Google Drive 소유자 인증이 만료됐습니다. 관리자에게 /api/admin/drive-setup 에서 재인증해 주세요.";

beforeEach(() => {
  requireEditAccess.mockReset();
  projectFindUnique.mockReset();
  projectFileFindUnique.mockReset();
  projectFileFindFirst.mockReset();
  projectFileDelete.mockReset();
  projectFileCreate.mockReset();
  upsertQuoteAmounts.mockReset();
  analyzeQuoteFile.mockReset();
  beginProjectUpload.mockReset(); finishProjectUpload.mockReset(); markProjectUploadPending.mockReset();
  beginProjectUpload.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" });
  finishProjectUpload.mockResolvedValue({ amountsApplied: false });
  markProjectUploadPending.mockResolvedValue(undefined);
  transaction.mockReset();
  transaction.mockImplementation(async (callback) => callback({
    $executeRaw: vi.fn(),
    projectFile: { create: projectFileCreate, findUnique: projectFileFindUnique, findFirst: projectFileFindFirst, delete: projectFileDelete },
  }));
  uploadFileToDrive.mockReset();
  deleteFileFromDrive.mockReset();
  deleteQuoteAmounts.mockReset();
  isInternalQuoteFileName.mockReset();
  isInternalQuoteFileName.mockReturnValue(false);
  revalidatePath.mockReset();
  requireEditAccess.mockResolvedValue({ user: { id: "user-1", role: "admin" } });
  projectFindUnique.mockResolvedValue({
    id: "project-1",
    name: "테스트 프로젝트",
    createdAt: new Date("2026-09-15T00:00:00.000Z"),
  });
  uploadFileToDrive.mockRejectedValue(new Error(ownerAuthError));
  deleteFileFromDrive.mockResolvedValue(undefined);
  projectFileDelete.mockResolvedValue(undefined);
  projectFileFindFirst.mockResolvedValue(null);
  deleteQuoteAmounts.mockResolvedValue(null);
});

describe("프로젝트 파일 액션", () => {
  it("세션 access token이 없어도 업로드를 시도하고 실패 파일에 이름과 이유를 담는다", async () => {
    const formData = new FormData();
    formData.append("file", new Blob(["내용"], { type: "text/plain" }), "실패.txt");

    const result = await uploadProjectFiles("project-1", formData);

    expect(result.failedFiles).toEqual([{ name: "실패.txt", reason: ownerAuthError }]);
    expect(uploadFileToDrive).toHaveBeenCalledTimes(1);
    expect(uploadFileToDrive.mock.calls[0]).toHaveLength(2);
    expect(requireEditAccess).toHaveBeenCalledWith("projects");
  });

  it("마지막 내부용 견적서를 삭제하면 연결된 금액도 지운다", async () => {
    isInternalQuoteFileName.mockReturnValue(true);
    projectFileFindUnique.mockResolvedValue({
      id: "file-1",
      projectId: "project-1",
      driveFileId: "drive-1",
      name: "내부용_견적서.xlsx",
    });

    await deleteProjectFile("file-1", "project-1");

    expect(deleteFileFromDrive).toHaveBeenCalledWith("drive-1");
    expect(projectFileDelete).toHaveBeenCalledWith({ where: { id: "file-1" } });
    expect(projectFileFindFirst).toHaveBeenCalledWith({
      where: { projectId: "project-1", name: "내부용_견적서.xlsx" },
      select: { id: true },
    });
    expect(deleteQuoteAmounts).toHaveBeenCalledWith("project-1", "내부용_견적서.xlsx", expect.anything());
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/projects/project-1");
    expect(revalidatePath).toHaveBeenCalledWith("/projects");
    expect(revalidatePath).toHaveBeenCalledWith("/projects/stats");
  });

  it("같은 이름의 내부용 견적서가 남아 있으면 연결된 금액을 보존한다", async () => {
    isInternalQuoteFileName.mockReturnValue(true);
    projectFileFindUnique.mockResolvedValue({
      id: "file-1",
      projectId: "project-1",
      driveFileId: "drive-1",
      name: "내부용_견적서.xlsx",
    });
    projectFileFindFirst.mockResolvedValue({ id: "file-2" });

    await deleteProjectFile("file-1", "project-1");

    expect(deleteQuoteAmounts).not.toHaveBeenCalled();
  });

  it("삭제가 이미 끝난 파일을 다시 요청해도 안전하게 종료한다", async () => {
    projectFileFindUnique.mockResolvedValue(null);
    await expect(deleteProjectFile("gone", "project-1")).resolves.toBeUndefined();
    expect(deleteFileFromDrive).not.toHaveBeenCalled();
  });

  it("내부용 견적서 재업로드는 파일과 금액을 같은 트랜잭션에서 반영한다", async () => {
    isInternalQuoteFileName.mockReturnValue(true);
    const analysis = { revenue: 2244000, cost: 1384328, confidence: "high", source: "spreadsheet", note: "검증", matchedLabels: [] };
    analyzeQuoteFile.mockResolvedValue(analysis);
    finishProjectUpload.mockResolvedValue({ amountsApplied: true });
    uploadFileToDrive.mockResolvedValue({ driveFileId: "new-drive", driveUrl: "https://drive.test/file", category: "quote" });
    const form = new FormData();
    form.append("file", new Blob(["test workbook"]), "내부용 견적서.xlsx");
    const result = await uploadProjectFiles("project-1", form);
    expect(result.failedFiles).toEqual([]);
    expect(result.uploadedFileNames).toEqual(["내부용 견적서.xlsx"]);
    expect(result.quoteAmountsApplied).toBe(true);
    expect(beginProjectUpload).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-1", createdById: "user-1" }), analysis);
    expect(finishProjectUpload).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001", expect.objectContaining({ driveFileId: "new-drive" }));
    expect(revalidatePath).toHaveBeenCalledWith("/company-finance");
  });

  it("금액 저장이 실패하면 업로드 성공으로 보고하지 않는다", async () => {
    isInternalQuoteFileName.mockReturnValue(true);
    analyzeQuoteFile.mockResolvedValue({ revenue: 100, cost: 50, confidence: "high" });
    uploadFileToDrive.mockResolvedValue({ driveFileId: "new-drive", driveUrl: "https://drive.test/file", category: "quote" });
    finishProjectUpload.mockRejectedValue(new Error("금액 저장 실패"));
    const form = new FormData();
    form.append("file", new Blob(["test workbook"]), "내부용 견적서.xlsx");
    const result = await uploadProjectFiles("project-1", form);
    expect(result.uploadedFileNames).toEqual([]);
    expect(result.quoteAmountsApplied).toBe(false);
    expect(result.pendingRecoveryNames).toEqual(["내부용 견적서.xlsx"]);
    expect(markProjectUploadPending).toHaveBeenCalledTimes(1);
    expect(result.failedFiles).toEqual([{ name: "내부용 견적서.xlsx", reason: "금액 저장 실패" }]);
  });

  it("판독 불가인 새 파일은 기존 금액을 지우지 않는다", async () => {
    isInternalQuoteFileName.mockReturnValue(true);
    analyzeQuoteFile.mockResolvedValue({ revenue: null, cost: null, confidence: "none" });
    uploadFileToDrive.mockResolvedValue({ driveFileId: "new-drive", driveUrl: "https://drive.test/file", category: "quote" });
    const form = new FormData();
    form.append("file", new Blob(["test workbook"]), "내부용 견적서.xlsx");
    const result = await uploadProjectFiles("project-1", form);
    expect(result.failedFiles).toEqual([]);
    expect(result.quoteAmountsApplied).toBe(false);
    expect(upsertQuoteAmounts).not.toHaveBeenCalled();
  });
});
