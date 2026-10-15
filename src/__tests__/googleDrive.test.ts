import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

const { fakeDrive, makeDriveClientAsOwner, isInvalidGrantError } = vi.hoisted(() => {
  const fakeDrive = {
    files: {
      list: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
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

import { deleteFileFromDrive, moveMessengerFilesToSpaceRegistration, uploadFileToDrive, findProjectUploadInDrive, downloadProjectQuote } from "@/lib/googleDrive";

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
  fakeDrive.files.get.mockReset();
  fakeDrive.files.update.mockReset();
  makeDriveClientAsOwner.mockResolvedValue(fakeDrive);
  fakeDrive.files.list.mockResolvedValue({ data: { files: [] } });
  fakeDrive.files.create
    .mockResolvedValueOnce({ data: { id: "root-folder" } })
    .mockResolvedValueOnce({ data: { id: "month-folder" } })
    .mockResolvedValueOnce({ data: { id: "project-folder" } })
    .mockResolvedValueOnce({ data: { id: "file-1", webViewLink: "https://drive.test/file-1" } });
});

describe("프로젝트 Drive 파일 업로드", () => {
  it("복구용 업로드는 비공개 appProperties에 작업 ID를 붙인다", async () => {
    await uploadFileToDrive({ ...fileInput(), recoveryKey: "00000000-0000-4000-8000-000000000001" }, project);
    expect(fakeDrive.files.create).toHaveBeenLastCalledWith(expect.objectContaining({ requestBody: expect.objectContaining({ appProperties: { erpUploadRecoveryId: "00000000-0000-4000-8000-000000000001" } }) }));
  });
  it("같은 복구 ID의 파일이 여러 개면 임의로 선택하지 않는다", async () => {
    fakeDrive.files.list.mockResolvedValue({ data: { files: [{ id: "one" }, { id: "two" }] } });
    await expect(findProjectUploadInDrive("00000000-0000-4000-8000-000000000001")).rejects.toThrow("RECOVERY_AMBIGUOUS");
  });
  it("큰 견적서는 다운로드하기 전에 거부한다", async () => {
    fakeDrive.files.get.mockResolvedValue({ data: { size: String(11 * 1024 * 1024) } });
    await expect(downloadProjectQuote("large")).rejects.toThrow("10MB"); expect(fakeDrive.files.get).toHaveBeenCalledTimes(1);
  });
  it("견적서 다운로드는 크기가 제한된 스트림으로 읽는다", async () => {
    fakeDrive.files.get.mockResolvedValueOnce({ data: { size: "3" } }).mockResolvedValueOnce({ data: Readable.from([Buffer.from("abc")]) });
    expect(await downloadProjectQuote("small")).toEqual(Buffer.from("abc"));
  });
  it("메타데이터 조회 뒤 원본이 커져도 스트림을 끊는다", async () => {
    fakeDrive.files.get.mockResolvedValueOnce({ data: { size: "3" } }).mockResolvedValueOnce({ data: Readable.from([Buffer.alloc(10 * 1024 * 1024 + 1)]) });
    await expect(downloadProjectQuote("changed")).rejects.toThrow("10MB");
  });
  it("이미 삭제된 Drive 파일은 삭제 완료로 처리하여 ERP 기록 정리를 막지 않는다", async () => {
    fakeDrive.files.delete.mockRejectedValue({ response: { status: 404 } });
    await expect(deleteFileFromDrive("already-deleted")).resolves.toBeUndefined();
  });

  it("Drive 삭제 권한 오류는 없는 파일로 오판하지 않는다", async () => {
    fakeDrive.files.delete.mockRejectedValue(new Error("permission denied"));
    await expect(deleteFileFromDrive("protected")).rejects.toThrow("permission denied");
  });
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

  it("여러 공간 사진은 폴더를 한 번만 찾고 같은 Drive 세션에서 병렬 이동한다", async () => {
    fakeDrive.files.list
      .mockResolvedValueOnce({ data: { files: [{ id: "project-root" }] } })
      .mockResolvedValueOnce({ data: { files: [{ id: "space-root" }] } })
      .mockResolvedValueOnce({ data: { files: [{ id: "space-folder" }] } });
    fakeDrive.files.get.mockImplementation(async ({ fileId }: { fileId: string }) => ({
      data: { id: fileId, name: `${fileId}.jpg`, parents: ["messenger"], webViewLink: `https://drive.test/${fileId}` },
    }));
    fakeDrive.files.update.mockImplementation(async ({ fileId }: { fileId: string }) => ({
      data: { id: fileId, name: `${fileId}.jpg`, webViewLink: `https://drive.test/${fileId}` },
    }));

    const result = await moveMessengerFilesToSpaceRegistration(
      ["image-1", "image-2", "image-1"],
      "V0001",
      "샘플 공간",
    );

    expect(result).toEqual({
      files: [
        { name: "image-1.jpg", driveUrl: "https://drive.test/image-1" },
        { name: "image-2.jpg", driveUrl: "https://drive.test/image-2" },
      ],
      folderPath: "천우영 프로젝트/공간 등록/V0001 샘플 공간",
      folderUrl: "https://drive.google.com/drive/folders/space-folder",
    });
    expect(makeDriveClientAsOwner).toHaveBeenCalledTimes(1);
    expect(fakeDrive.files.list).toHaveBeenCalledTimes(3);
    expect(fakeDrive.files.get).toHaveBeenCalledTimes(2);
    expect(fakeDrive.files.update).toHaveBeenCalledTimes(2);
  });
});
