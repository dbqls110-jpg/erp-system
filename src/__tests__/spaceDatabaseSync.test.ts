import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const spreadsheetsGet = vi.fn();
  const valuesGet = vi.fn();
  const valuesBatchGet = vi.fn();
  const batchUpdate = vi.fn();
  const makeSheetsClientAsOwner = vi.fn();
  const ensureSpaceRegistrationFolder = vi.fn();
  const moveMessengerFilesToSpaceRegistration = vi.fn();
  const spreadsheetClient = {
    spreadsheets: {
      get: spreadsheetsGet,
      values: { get: valuesGet, batchGet: valuesBatchGet },
      batchUpdate,
    },
  };
  return {
    spreadsheetsGet,
    valuesGet,
    valuesBatchGet,
    batchUpdate,
    makeSheetsClientAsOwner,
    ensureSpaceRegistrationFolder,
    moveMessengerFilesToSpaceRegistration,
    spreadsheetClient,
  };
});

vi.mock("@/lib/googleClient", () => ({ makeSheetsClientAsOwner: mocks.makeSheetsClientAsOwner }));
vi.mock("@/lib/googleDrive", () => ({
  ensureSpaceRegistrationFolder: mocks.ensureSpaceRegistrationFolder,
  moveMessengerFilesToSpaceRegistration: mocks.moveMessengerFilesToSpaceRegistration,
}));

import { syncSpaceRegistrationDirect } from "@/lib/spaceDatabaseSync";

const HOST_SHEET_ID = "1A5xN_nii5AeAkM9JSF0morcetMCI3A7TDcvk3xRjd1M";
const SPACE_DB_ID = "1XFfEdhOwFMyZE7IuDcykDaRNQ8IXtPq6bvwA-StjII4";

describe("공간 등록 Google Sheets/Drive 왕복 최적화", () => {
  const hostHeaders = ["등록번호", "등록일시 (한국시간)", "등록 상태"];
  const spaceDbHeaders = Array.from({ length: 81 }, () => "");

  beforeEach(() => {
    vi.clearAllMocks();
    spaceDbHeaders[0] = "이름";
    spaceDbHeaders[1] = "위치";
    mocks.makeSheetsClientAsOwner.mockResolvedValue(mocks.spreadsheetClient);
    mocks.ensureSpaceRegistrationFolder.mockResolvedValue({
      folderPath: "천우영 프로젝트/공간 등록/V0001 샘플 공간",
      folderUrl: "https://drive.google.com/drive/folders/space-folder",
    });
    mocks.moveMessengerFilesToSpaceRegistration.mockResolvedValue({
      folderPath: "천우영 프로젝트/공간 등록/V0001 샘플 공간",
      folderUrl: "https://drive.google.com/drive/folders/space-folder",
      files: [
        { name: "외관.jpg", driveUrl: "https://drive.google.com/file/d/photo-1" },
        { name: "내부.jpg", driveUrl: "https://drive.google.com/file/d/photo-2" },
      ],
    });
    mocks.spreadsheetsGet.mockImplementation(async ({ spreadsheetId }: { spreadsheetId: string }) => {
      const host = spreadsheetId === HOST_SHEET_ID;
      return {
        data: {
          sheets: [{
            properties: {
              sheetId: host ? 11 : 22,
              title: host ? "호스트 등록 공간" : "공간DB",
              gridProperties: { rowCount: 1000, columnCount: host ? 3 : 81 },
            },
          }],
        },
      };
    });
    mocks.valuesGet.mockImplementation(async ({ spreadsheetId, range }: { spreadsheetId: string; range: string }) => {
      if (spreadsheetId === HOST_SHEET_ID) return { data: { values: [hostHeaders] } };
      if (range.includes("!A2:C2")) return { data: { values: [["샘플 공간", "서울", "서울"]] } };
      if (/!A2:[A-Z]+2$/.test(range)) return { data: { values: [] } };
      return { data: { values: [spaceDbHeaders] } };
    });
    mocks.valuesBatchGet.mockResolvedValue({ data: { valueRanges: [{ values: [] }, { values: [] }] } });
    mocks.batchUpdate.mockResolvedValue({ data: {} });
  });

  it("각 시트 본문은 한 번만 읽고, 폴더 링크 포함 호스트 행도 한 번만 쓴다", async () => {
    const result = await syncSpaceRegistrationDirect({
      spaceName: "샘플 공간",
      address: "서울시 중구 세종대로 1",
    }, new Date("2026-09-29T00:00:00.000Z"));

    expect(result.spaceCode).toBe("V0001");
    expect(mocks.spreadsheetsGet).toHaveBeenCalledTimes(2);
    const reads = mocks.valuesGet.mock.calls.map(([args]) => args as { spreadsheetId: string; range: string });
    expect(reads.filter((read) => read.spreadsheetId === HOST_SHEET_ID)).toHaveLength(1);
    expect(reads.filter((read) => read.spreadsheetId === SPACE_DB_ID && read.range.includes("!A1:") && read.range.endsWith("1"))).toHaveLength(1);
    expect(reads.filter((read) => read.spreadsheetId === SPACE_DB_ID && read.range.includes("!A2:") && !read.range.endsWith(":C2"))).toHaveLength(1);
    // 저장 성공 여부는 batchUpdate의 응답으로 확인하므로 추가 readback 왕복은 하지 않는다.
    expect(reads.filter((read) => read.range.includes("!A2:C2"))).toHaveLength(0);
    expect(mocks.valuesBatchGet).toHaveBeenCalledTimes(1);

    const hostRowWrites = mocks.batchUpdate.mock.calls.filter(([args]) => {
      const call = args as { spreadsheetId: string; requestBody: { requests: Array<{ updateCells?: { range: { startRowIndex: number } } }> } };
      return call.spreadsheetId === HOST_SHEET_ID
        && call.requestBody.requests.some((request) => request.updateCells?.range.startRowIndex === 1);
    });
    expect(hostRowWrites).toHaveLength(1);
    const databaseRowWrites = mocks.batchUpdate.mock.calls.filter(([args]) => {
      const call = args as { spreadsheetId: string; requestBody: { requests: Array<{ updateCells?: { range: { startRowIndex: number } } }> } };
      return call.spreadsheetId === SPACE_DB_ID
        && call.requestBody.requests.some((request) => request.updateCells?.range.startRowIndex === 1);
    });
    expect(databaseRowWrites).toHaveLength(1);
    expect(mocks.ensureSpaceRegistrationFolder).toHaveBeenCalledTimes(1);
    expect(mocks.moveMessengerFilesToSpaceRegistration).not.toHaveBeenCalled();
  });

  it("호스트 시트와 공간DB 쓰기를 동시에 시작한다", async () => {
    const writeResolvers: Array<(value: { data: Record<string, never> }) => void> = [];
    mocks.batchUpdate.mockImplementation((args: {
      spreadsheetId: string;
      requestBody: { requests: Array<{ updateCells?: { range: { startRowIndex: number } } }> };
    }) => {
      const isRowWrite = args.requestBody.requests.some((request) => (request.updateCells?.range.startRowIndex ?? 0) > 0);
      if (!isRowWrite) return Promise.resolve({ data: {} });
      return new Promise((resolve) => writeResolvers.push(resolve));
    });

    const syncPromise = syncSpaceRegistrationDirect({
      spaceName: "샘플 공간",
      address: "서울시 중구 세종대로 1",
    }, new Date("2026-09-29T00:00:00.000Z"));

    await vi.waitFor(() => expect(writeResolvers).toHaveLength(2));
    writeResolvers.forEach((resolve) => resolve({ data: {} }));
    await expect(syncPromise).resolves.toMatchObject({ spaceCode: "V0001" });
  });

  it("두 시트 저장 중 한쪽만 실패하면 부분 반영 상태를 구분해 알린다", async () => {
    mocks.batchUpdate.mockImplementation((args: {
      spreadsheetId: string;
      requestBody: {
        requests: Array<{
          updateCells?: { range: { startRowIndex: number } };
        }>;
      };
    }) => {
      const isRowWrite = args.requestBody.requests.some((request) => (request.updateCells?.range.startRowIndex ?? 0) > 0);
      if (isRowWrite && args.spreadsheetId === SPACE_DB_ID) return Promise.reject(new Error("simulated write failure"));
      return Promise.resolve({ data: {} });
    });

    await expect(syncSpaceRegistrationDirect({
      spaceName: "샘플 공간",
      address: "서울시 중구 세종대로 1",
    }, new Date("2026-09-29T00:00:00.000Z"))).rejects.toThrow("호스트 등록 공간에는 반영됐지만 공간DB 저장이 실패했습니다");
  });

  it("첨부 여러 장은 공간 폴더 준비·이동 작업 한 번으로 묶는다", async () => {
    const result = await syncSpaceRegistrationDirect({
      spaceName: "샘플 공간",
      address: "서울시 중구 세종대로 1",
      photoDriveFileIds: ["photo-1", "photo-2", "photo-1"],
    }, new Date("2026-09-29T00:00:00.000Z"));

    expect(mocks.moveMessengerFilesToSpaceRegistration).toHaveBeenCalledTimes(1);
    expect(mocks.moveMessengerFilesToSpaceRegistration).toHaveBeenCalledWith(
      ["photo-1", "photo-2"],
      "V0001",
      "샘플 공간",
    );
    expect(mocks.ensureSpaceRegistrationFolder).not.toHaveBeenCalled();
    expect(result.photos).toHaveLength(2);
  });

  it("공간DB에 같은 이름·주소가 여러 행이면 시트 행을 쓰지 않고 중단한다", async () => {
    mocks.valuesBatchGet.mockResolvedValueOnce({
      data: {
        valueRanges: [
          { values: [["샘플 공간"], ["샘플 공간"]] },
          { values: [["서울시 중구 세종대로 1"], ["서울시 중구 세종대로 1"]] },
        ],
      },
    });

    await expect(syncSpaceRegistrationDirect({
      spaceName: "샘플 공간",
      address: "서울시 중구 세종대로 1",
    }, new Date("2026-09-29T00:00:00.000Z"))).rejects.toThrow("일치하는 행이 여러 개");

    const hostRowWrites = mocks.batchUpdate.mock.calls.filter(([args]) => {
      const call = args as { spreadsheetId: string; requestBody: { requests: Array<{ updateCells?: { range: { startRowIndex: number } } }> } };
      return call.spreadsheetId === HOST_SHEET_ID
        && call.requestBody.requests.some((request) => request.updateCells?.range.startRowIndex === 1);
    });
    expect(hostRowWrites).toHaveLength(0);
  });
});
