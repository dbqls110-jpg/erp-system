import { beforeEach, describe, expect, it, vi } from "vitest";

const { fakeSheets, valuesGet, valuesUpdate, spreadsheetsGet, batchUpdate } = vi.hoisted(() => {
  const valuesGet = vi.fn();
  const valuesUpdate = vi.fn();
  const spreadsheetsGet = vi.fn();
  const batchUpdate = vi.fn();
  const fakeSheets = {
    spreadsheets: {
      values: { get: valuesGet, update: valuesUpdate },
      get: spreadsheetsGet,
      batchUpdate,
    },
  };
  return { fakeSheets, valuesGet, valuesUpdate, spreadsheetsGet, batchUpdate };
});

vi.mock("@/lib/googleClient", () => ({
  makeSheetsClientAsOwner: vi.fn(async () => fakeSheets),
}));

import {
  getSpaceRentals,
  saveSpaceRentalStage,
} from "@/lib/spaceRentalSheet";

type CellRange = { startColumnIndex: number; endColumnIndex: number };
type Request = {
  updateCells?: { range: CellRange };
  repeatCell?: { range: CellRange; cell: { userEnteredFormat: { backgroundColor: { red: number; green: number; blue: number } } } };
};

function headerRow(): string[] {
  return Array.from({ length: 39 }, (_, index) => `header-${index}`);
}

function dataRow(overrides: Record<number, string> = {}): string[] {
  const values = Array.from({ length: 39 }, () => "");
  values[0] = "In";
  values[1] = "RSV-001";
  values[5] = "client@example.com";
  Object.entries(overrides).forEach(([index, value]) => { values[Number(index)] = value; });
  return values;
}

const identity = { category: "In", reservationNumber: "RSV-001", email: "client@example.com" };

beforeEach(() => {
  valuesGet.mockReset();
  valuesUpdate.mockReset();
  spreadsheetsGet.mockReset();
  batchUpdate.mockReset();
  valuesGet.mockResolvedValue({ data: { values: [headerRow(), dataRow()] } });
  spreadsheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { sheetId: 42, title: "진행 고객" } }] } });
  batchUpdate.mockResolvedValue({});
});

describe("공간대관 시트 쓰기", () => {
  it("단계 변경은 W와 해당 AI~AM 시각만 쓰고 X~AH는 건드리지 않는다", async () => {
    const result = await saveSpaceRentalStage(identity, "2차 연락", new Date("2026-09-09T01:00:00.000Z"));

    expect(result).toEqual({ stage: "2차 연락", timestamp: "2026-09-09 10:00" });
    const requests = batchUpdate.mock.calls[0][0].requestBody.requests as Request[];
    const writtenRanges = requests
      .map((request) => request.updateCells?.range ?? request.repeatCell?.range)
      .filter((range): range is CellRange => Boolean(range));
    const columnRanges = writtenRanges.map(({ startColumnIndex, endColumnIndex }) => ({ startColumnIndex, endColumnIndex }));

    expect(columnRanges).toEqual(expect.arrayContaining([
      { startColumnIndex: 22, endColumnIndex: 23 }, // W
      { startColumnIndex: 35, endColumnIndex: 36 }, // AJ
      { startColumnIndex: 34, endColumnIndex: 39 }, // AI~AM 색상 범위
    ]));
    expect(writtenRanges.some((range) => range.startColumnIndex < 34 && range.endColumnIndex > 23)).toBe(false);
    expect(writtenRanges.some((range) => range.startColumnIndex >= 23 && range.endColumnIndex <= 34)).toBe(false);
  });

  it("종료는 회색을 쓰고 진행 단계로 되돌릴 때 명시적인 흰색을 쓴다", async () => {
    await saveSpaceRentalStage(identity, "종료");
    const closeRequests = batchUpdate.mock.calls[0][0].requestBody.requests as Request[];
    const gray = closeRequests.find((request) => request.repeatCell?.range.startColumnIndex === 0);
    expect(gray?.repeatCell?.cell.userEnteredFormat.backgroundColor).toEqual({ red: 0.9, green: 0.9, blue: 0.9 });

    batchUpdate.mockReset();
    await saveSpaceRentalStage(identity, "문의");
    const restoreRequests = batchUpdate.mock.calls[0][0].requestBody.requests as Request[];
    const white = restoreRequests.find((request) => request.repeatCell?.range.startColumnIndex === 0);
    expect(white?.repeatCell?.cell.userEnteredFormat.backgroundColor).toEqual({ red: 1, green: 1, blue: 1 });
  });

  it("동일한 A·B·F 행이 둘이면 쓰기를 중단한다", async () => {
    valuesGet.mockResolvedValueOnce({ data: { values: [headerRow(), dataRow(), dataRow()] } });

    await expect(saveSpaceRentalStage(identity, "1차 연락")).rejects.toThrow("여러 개라 안전하게 저장하지 않았습니다");
    expect(batchUpdate).not.toHaveBeenCalled();
  });

  it("AI 이후 헤더가 없으면 AI~AM에만 만든다", async () => {
    const missingHeader = headerRow().fill("", 34);
    valuesGet.mockResolvedValueOnce({ data: { values: [missingHeader, dataRow()] } });

    await getSpaceRentals();

    expect(valuesUpdate).toHaveBeenCalledTimes(5);
    expect(valuesUpdate.mock.calls.map((call) => call[0].range)).toEqual([
      "'진행 고객'!AI1",
      "'진행 고객'!AJ1",
      "'진행 고객'!AK1",
      "'진행 고객'!AL1",
      "'진행 고객'!AM1",
    ]);
  });
});
