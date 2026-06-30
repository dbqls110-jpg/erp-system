import { google } from "googleapis";

function getAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64 ?? "";
  const credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function hex(h: string) {
  const r = parseInt(h.slice(1, 3), 16) / 255;
  const g = parseInt(h.slice(3, 5), 16) / 255;
  const b = parseInt(h.slice(5, 7), 16) / 255;
  return { red: r, green: g, blue: b };
}

const WHITE = hex("#ffffff");
const DARK = hex("#1e1e2e");
const ACCENT = hex("#5b6cf8");
const ACCENT_LIGHT = hex("#eef0fe");
const SECTION = hex("#f4f4f8");
const GRAY = hex("#6b7280");
const GREEN = hex("#16a34a");
const RED = hex("#dc2626");

function cell(
  sheetId: number,
  row: number,
  col: number,
  rowSpan = 1,
  colSpan = 1
) {
  return {
    sheetId,
    startRowIndex: row,
    endRowIndex: row + rowSpan,
    startColumnIndex: col,
    endColumnIndex: col + colSpan,
  };
}

export async function createSpreadsheet(): Promise<string> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.create({
    requestBody: { properties: { title: "ERP 재무 관리" } },
  });
  return res.data.spreadsheetId!;
}

export interface MonthReportData {
  year: number;
  month: number;
  budget: number | null;
  total: number;
  categoryTotals: { label: string; amount: number; color: string }[];
  expenses: { date: string; title: string; category: string; amount: number; userName: string; memo: string }[];
}

export async function addMonthSheet(spreadsheetId: string, data: MonthReportData): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const title = `${data.year}.${String(data.month).padStart(2, "0")} 재무 관리`;

  // 탭 추가
  let sheetId = Date.now() % 100000;
  try {
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title, sheetId } } }],
      },
    });
    sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? sheetId;
  } catch {
    // 이미 존재하면 sheetId 가져오기
    const info = await sheets.spreadsheets.get({ spreadsheetId });
    const found = info.data.sheets?.find(s => s.properties?.title === title);
    sheetId = found?.properties?.sheetId ?? sheetId;
  }

  const remaining = data.budget != null ? data.budget - data.total : null;

  // ── 데이터 행 구성 ──────────────────────────────────────
  const ROWS: string[][] = [];
  // 0: 제목
  ROWS.push([`${data.year}년 ${data.month}월 재무 관리`, "", "", "", "", ""]);
  // 1: 빈 행
  ROWS.push(["", "", "", "", "", ""]);
  // 2: 요약 헤더
  ROWS.push(["예산", "총 지출", "잔여 예산", "", "", ""]);
  // 3: 요약 값
  ROWS.push([
    data.budget != null ? data.budget.toLocaleString() + "원" : "-",
    data.total.toLocaleString() + "원",
    remaining != null ? remaining.toLocaleString() + "원" : "-",
    "", "", "",
  ]);
  // 4: 빈 행
  ROWS.push(["", "", "", "", "", ""]);
  // 5: 카테고리 섹션 헤더
  ROWS.push(["카테고리별 지출", "", "", "", "", ""]);
  // 6: 카테고리 컬럼 헤더
  ROWS.push(["카테고리", "금액", "비율", "", "", ""]);
  // 7~: 카테고리 데이터
  const catStart = ROWS.length;
  for (const cat of data.categoryTotals) {
    const pct = data.total > 0 ? ((cat.amount / data.total) * 100).toFixed(1) + "%" : "0%";
    ROWS.push([cat.label, cat.amount.toLocaleString() + "원", pct, "", "", ""]);
  }
  // 합계 행
  ROWS.push(["합계", data.total.toLocaleString() + "원", "100%", "", "", ""]);
  const catEnd = ROWS.length;
  // 빈 행
  ROWS.push(["", "", "", "", "", ""]);
  // 지출 내역 섹션 헤더
  ROWS.push(["지출 내역", "", "", "", "", ""]);
  // 지출 컬럼 헤더
  const expHeaderRow = ROWS.length;
  ROWS.push(["날짜", "항목", "카테고리", "금액", "작성자", "메모"]);
  // 지출 데이터
  const expStart = ROWS.length;
  for (const e of data.expenses) {
    ROWS.push([e.date, e.title, e.category, e.amount.toLocaleString() + "원", e.userName, e.memo]);
  }

  // 데이터 쓰기
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${title}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: ROWS },
  });

  // ── 포맷 요청 ───────────────────────────────────────────
  const requests: object[] = [];

  // 열 너비
  const colWidths = [110, 220, 130, 120, 90, 180];
  colWidths.forEach((w, i) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: w },
        fields: "pixelSize",
      },
    });
  });

  // 제목 행 (row 0)
  requests.push({
    mergeCells: { range: cell(sheetId, 0, 0, 1, 6), mergeType: "MERGE_ALL" },
  });
  requests.push({
    repeatCell: {
      range: cell(sheetId, 0, 0, 1, 6),
      cell: {
        userEnteredFormat: {
          backgroundColor: ACCENT,
          textFormat: { foregroundColor: WHITE, bold: true, fontSize: 16 },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
        },
      },
      fields: "userEnteredFormat",
    },
  });

  // 행 높이: 제목 45px
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 45 },
      fields: "pixelSize",
    },
  });

  // 요약 헤더 (row 2)
  requests.push({
    repeatCell: {
      range: cell(sheetId, 2, 0, 1, 3),
      cell: {
        userEnteredFormat: {
          backgroundColor: SECTION,
          textFormat: { foregroundColor: GRAY, bold: true, fontSize: 10 },
          horizontalAlignment: "CENTER",
        },
      },
      fields: "userEnteredFormat",
    },
  });

  // 요약 값 (row 3)
  const summaryColors = [DARK, remaining != null && remaining < 0 ? RED : DARK, remaining != null && remaining < 0 ? RED : GREEN];
  summaryColors.forEach((color, i) => {
    requests.push({
      repeatCell: {
        range: cell(sheetId, 3, i, 1, 1),
        cell: {
          userEnteredFormat: {
            textFormat: { foregroundColor: color, bold: true, fontSize: 14 },
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat",
      },
    });
  });

  // 카테고리 섹션 헤더 (row 5)
  requests.push({
    mergeCells: { range: cell(sheetId, 5, 0, 1, 6), mergeType: "MERGE_ALL" },
  });
  requests.push({
    repeatCell: {
      range: cell(sheetId, 5, 0, 1, 6),
      cell: {
        userEnteredFormat: {
          backgroundColor: ACCENT_LIGHT,
          textFormat: { foregroundColor: ACCENT, bold: true, fontSize: 12 },
          horizontalAlignment: "LEFT",
        },
      },
      fields: "userEnteredFormat",
    },
  });

  // 카테고리 컬럼 헤더 (row 6)
  requests.push({
    repeatCell: {
      range: cell(sheetId, 6, 0, 1, 3),
      cell: {
        userEnteredFormat: {
          backgroundColor: DARK,
          textFormat: { foregroundColor: WHITE, bold: true },
          horizontalAlignment: "CENTER",
        },
      },
      fields: "userEnteredFormat",
    },
  });

  // 카테고리 데이터 행 (alternating)
  for (let i = catStart; i < catEnd - 1; i++) {
    const bg = i % 2 === 0 ? hex("#f9f9fb") : WHITE;
    requests.push({
      repeatCell: {
        range: cell(sheetId, i, 0, 1, 3),
        cell: { userEnteredFormat: { backgroundColor: bg } },
        fields: "userEnteredFormat",
      },
    });
  }

  // 카테고리 합계 행
  requests.push({
    repeatCell: {
      range: cell(sheetId, catEnd - 1, 0, 1, 3),
      cell: {
        userEnteredFormat: {
          backgroundColor: SECTION,
          textFormat: { bold: true },
        },
      },
      fields: "userEnteredFormat",
    },
  });

  // 지출 내역 섹션 헤더
  const expSectionRow = expHeaderRow - 1;
  requests.push({
    mergeCells: { range: cell(sheetId, expSectionRow, 0, 1, 6), mergeType: "MERGE_ALL" },
  });
  requests.push({
    repeatCell: {
      range: cell(sheetId, expSectionRow, 0, 1, 6),
      cell: {
        userEnteredFormat: {
          backgroundColor: ACCENT_LIGHT,
          textFormat: { foregroundColor: ACCENT, bold: true, fontSize: 12 },
          horizontalAlignment: "LEFT",
        },
      },
      fields: "userEnteredFormat",
    },
  });

  // 지출 컬럼 헤더
  requests.push({
    repeatCell: {
      range: cell(sheetId, expHeaderRow, 0, 1, 6),
      cell: {
        userEnteredFormat: {
          backgroundColor: DARK,
          textFormat: { foregroundColor: WHITE, bold: true },
          horizontalAlignment: "CENTER",
        },
      },
      fields: "userEnteredFormat",
    },
  });

  // 지출 데이터 alternating
  for (let i = expStart; i < ROWS.length; i++) {
    const bg = i % 2 === 0 ? hex("#f9f9fb") : WHITE;
    requests.push({
      repeatCell: {
        range: cell(sheetId, i, 0, 1, 6),
        cell: { userEnteredFormat: { backgroundColor: bg } },
        fields: "userEnteredFormat",
      },
    });
    // 금액 열 우측 정렬
    requests.push({
      repeatCell: {
        range: cell(sheetId, i, 3, 1, 1),
        cell: { userEnteredFormat: { horizontalAlignment: "RIGHT" } },
        fields: "userEnteredFormat",
      },
    });
  }

  // 전체 폰트 및 테두리
  requests.push({
    repeatCell: {
      range: cell(sheetId, 0, 0, ROWS.length, 6),
      cell: {
        userEnteredFormat: {
          textFormat: { fontFamily: "Google Sans", fontSize: 10 },
          verticalAlignment: "MIDDLE",
        },
      },
      fields: "userEnteredFormat(textFormat(fontFamily,fontSize),verticalAlignment)",
    },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
}
