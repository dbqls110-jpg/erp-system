import { beforeEach, describe, expect, it, vi } from "vitest";

const { fakeDrive, makeDriveClientAsOwner, isInvalidGrantError } = vi.hoisted(() => {
  const fakeDrive = {
    files: {
      list: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  };
  const makeDriveClientAsOwner = vi.fn();
  const isInvalidGrantError = vi.fn((error: unknown) => {
    if (!error || typeof error !== "object") return false;
    const value = error as { message?: unknown; response?: { data?: { error?: unknown } } };
    return value.response?.data?.error === "invalid_grant" || String(value.message ?? "").includes("invalid_grant");
  });
  return { fakeDrive, makeDriveClientAsOwner, isInvalidGrantError };
});

vi.mock("@/lib/googleClient", () => ({
  makeDriveClientAsOwner,
  isInvalidGrantError,
}));

import { uploadFileToDrive } from "@/lib/googleDrive";

function fileInput(name = "notes.bin") {
  return {
    buffer: Buffer.from("내용"),
    name,
    mimeType: "application/octet-stream",
    size: 6,
  };
}

const project = {
  id: "project-1",
  name: "테스트 프로젝트",
  createdAt: new Date("2026-09-15T00:00:00.000Z"),
};

beforeEach(() => {
  makeDriveClientAsOwner.mockReset();
  isInvalidGrantError.mockClear();
  fakeDrive.files.list.mockReset();
  fakeDrive.files.create.mockReset();
  fakeDrive.files.delete.mockReset();
  makeDriveClientAsOwner.mockResolvedValue(fakeDrive);
  fakeDrive.files.list.mockResolvedValue({ data: { files: [] } });
  fakeDrive.files.create
    .mockResolvedValueOnce({ data: { id: "root-folder" } })
    .mockResolvedValueOnce({ data: { id: "month-folder" } })
    .mockResolvedValueOnce({ data: { id: "project-folder" } })
    .mockResolvedValueOnce({ data: { id: "file-1", webViewLink: "https://drive.test/file-1" } });
});

describe("프로젝트 Drive 파일 업로드", () => {
  it("세션 토큰 없이 소유자 Drive 클라이언트로 업로드한다", async () => {
    const result = await uploadFileToDrive(fileInput(), project);

    expect(result).toEqual({
      driveFileId: "file-1",
      driveUrl: "https://drive.test/file-1",
      category: null,
    });
    expect(makeDriveClientAsOwner).toHaveBeenCalledTimes(1);
    expect(fakeDrive.files.create).toHaveBeenCalledTimes(4);
  });

  it("소유자 refresh token이 만료되면 관리자 재인증 안내를 던진다", async () => {
    fakeDrive.files.list.mockRejectedValue({ response: { data: { error: "invalid_grant" } } });

    await expect(uploadFileToDrive(fileInput(), project)).rejects.toThrow("/api/admin/drive-setup");
  });
});
