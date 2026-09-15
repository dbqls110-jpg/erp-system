import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireEditAccess, projectFindUnique, uploadFileToDrive, revalidatePath } = vi.hoisted(() => ({
  requireEditAccess: vi.fn(),
  projectFindUnique: vi.fn(),
  uploadFileToDrive: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/actionGuards", () => ({ requireEditAccess }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: projectFindUnique },
    projectFile: { create: vi.fn() },
  },
}));
vi.mock("@/lib/googleDrive", () => ({ uploadFileToDrive, deleteFileFromDrive: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/quoteParser", () => ({ analyzeQuoteFile: vi.fn() }));
vi.mock("@/lib/quotePolicy", () => ({ isInternalQuoteFileName: vi.fn(() => false) }));
vi.mock("@/lib/projectAmounts", () => ({ upsertQuoteAmounts: vi.fn() }));

import { uploadProjectFiles } from "@/app/actions/projectFile";

const ownerAuthError = "Google Drive 소유자 인증이 만료됐습니다. 관리자에게 /api/admin/drive-setup 에서 재인증해 주세요.";

beforeEach(() => {
  requireEditAccess.mockReset();
  projectFindUnique.mockReset();
  uploadFileToDrive.mockReset();
  revalidatePath.mockReset();
  requireEditAccess.mockResolvedValue({ user: { id: "user-1", role: "admin" } });
  projectFindUnique.mockResolvedValue({
    id: "project-1",
    name: "테스트 프로젝트",
    createdAt: new Date("2026-09-15T00:00:00.000Z"),
  });
  uploadFileToDrive.mockRejectedValue(new Error(ownerAuthError));
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
});
