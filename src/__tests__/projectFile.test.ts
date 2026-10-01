import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireEditAccess,
  projectFindUnique,
  projectFileFindUnique,
  projectFileFindFirst,
  projectFileDelete,
  uploadFileToDrive,
  deleteFileFromDrive,
  deleteQuoteAmounts,
  isInternalQuoteFileName,
  revalidatePath,
} = vi.hoisted(() => ({
  requireEditAccess: vi.fn(),
  projectFindUnique: vi.fn(),
  projectFileFindUnique: vi.fn(),
  projectFileFindFirst: vi.fn(),
  projectFileDelete: vi.fn(),
  uploadFileToDrive: vi.fn(),
  deleteFileFromDrive: vi.fn(),
  deleteQuoteAmounts: vi.fn(),
  isInternalQuoteFileName: vi.fn(() => false),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/actionGuards", () => ({ requireEditAccess }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: projectFindUnique },
    projectFile: {
      create: vi.fn(),
      findUnique: projectFileFindUnique,
      findFirst: projectFileFindFirst,
      delete: projectFileDelete,
    },
  },
}));
vi.mock("@/lib/googleDrive", () => ({ uploadFileToDrive, deleteFileFromDrive }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/quoteParser", () => ({ analyzeQuoteFile: vi.fn() }));
vi.mock("@/lib/quotePolicy", () => ({ isInternalQuoteFileName }));
vi.mock("@/lib/projectAmounts", () => ({ upsertQuoteAmounts: vi.fn(), deleteQuoteAmounts }));

import { deleteProjectFile, uploadProjectFiles } from "@/app/actions/projectFile";

const ownerAuthError = "Google Drive 소유자 인증이 만료됐습니다. 관리자에게 /api/admin/drive-setup 에서 재인증해 주세요.";

beforeEach(() => {
  requireEditAccess.mockReset();
  projectFindUnique.mockReset();
  projectFileFindUnique.mockReset();
  projectFileFindFirst.mockReset();
  projectFileDelete.mockReset();
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
    expect(deleteQuoteAmounts).toHaveBeenCalledWith("project-1", "내부용_견적서.xlsx");
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
});
