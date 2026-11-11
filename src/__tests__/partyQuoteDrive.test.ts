import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ files: { list: vi.fn(), create: vi.fn(), get: vi.fn(), generateIds: vi.fn() }, permissions: { list: vi.fn() }, owner: vi.fn() }));
vi.mock("@/lib/googleClient", () => ({ makeDriveClientAsOwner: m.owner, isInvalidGrantError: () => false }));
import { preparePartyQuoteFolder, reservePartyQuoteDriveId, uploadPartyQuoteToDrive, verifyPartyQuoteInDrive } from "@/lib/googleDrive";
const file = { id: "quote-id", driveFileId: "reserved-file", name: "fixture.pdf", mimeType: "application/pdf", size: 5, contentSha256: "a".repeat(64) };
beforeEach(() => {
  vi.clearAllMocks(); m.owner.mockResolvedValue({ files: m.files, permissions: m.permissions });
  m.files.list.mockResolvedValue({ data: { files: [{ id: "private-folder" }] } });
  m.permissions.list.mockResolvedValue({ data: { permissions: [{ role: "owner" }] } });
  m.files.create.mockResolvedValue({ data: { id: file.driveFileId } });
  m.files.get.mockResolvedValue({ data: { id: file.driveFileId, size: "5", mimeType: file.mimeType, appProperties: { erpPartyQuoteId: file.id }, sha256Checksum: file.contentSha256 } });
});
describe("비공개 Drive 견적서 저장", () => {
  it("외부 공유가 있는 폴더에는 파일을 넣지 않는다", async () => {
    m.permissions.list.mockResolvedValue({ data: { permissions: [{ role: "owner" }, { role: "reader" }] } });
    await expect(preparePartyQuoteFolder({ kind: "customer", id: "customer", name: "fixture" })).rejects.toThrow("외부 공유");
    expect(m.files.create).not.toHaveBeenCalled();
  });
  it("사전 발급 ID로 원본 파일을 생성하며 공개 공유를 추가하지 않는다", async () => {
    m.files.generateIds.mockResolvedValue({ data: { ids: [file.driveFileId] } });
    expect(await reservePartyQuoteDriveId()).toBe(file.driveFileId);
    await uploadPartyQuoteToDrive({ ...file, buffer: Buffer.from("%PDF-") }, "private-folder");
    expect(m.files.create).toHaveBeenCalledWith(expect.objectContaining({ requestBody: { id: file.driveFileId, name: file.name, parents: ["private-folder"], appProperties: { erpPartyQuoteId: file.id } } }), { timeout: 30_000 });
  });
  it("이미 있는 파일 ID의409는 덮어쓰기 없이 확인 단계로 넘긴다", async () => {
    m.files.create.mockRejectedValue({ response: { status: 409 } });
    await expect(uploadPartyQuoteToDrive({ ...file, buffer: Buffer.from("%PDF-") }, "private-folder")).resolves.toBeUndefined();
    expect(m.files.create).toHaveBeenCalledTimes(1);
  });
  it("실제 checksum·크기·종류·애플리케이션 ID가 같아야 저장 완료로 본다", async () => {
    expect(await verifyPartyQuoteInDrive(file)).toBe(true);
    m.files.get.mockResolvedValue({ data: { size: "5", mimeType: file.mimeType, appProperties: { erpPartyQuoteId: file.id }, sha256Checksum: "wrong" } });
    await expect(verifyPartyQuoteInDrive(file)).rejects.toThrow("원본이 달라");
  });
  it("없는 파일만 false이고 인증·권한 실패는 복구 완료로 바꾸지 않는다", async () => {
    m.files.get.mockRejectedValue({ response: { status: 404 } });
    expect(await verifyPartyQuoteInDrive(file)).toBe(false);
    m.files.get.mockRejectedValue(Error("permission denied"));
    await expect(verifyPartyQuoteInDrive(file)).rejects.toThrow("permission denied");
  });
});
