import { google } from "googleapis";

function getAuth() {
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey,
    },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}

export async function createSpreadsheet(): Promise<string> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.create({
    requestBody: { properties: { title: "ERP 재무 관리" } },
  });
  return res.data.spreadsheetId!;
}

export async function addMonthSheet(
  spreadsheetId: string,
  year: number,
  month: number,
  rows: (string | number)[][]
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const title = `${year}.${String(month).padStart(2, "0")} 재무 관리`;

  // 탭 추가 (이미 있으면 무시)
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
  } catch {
    // 이미 존재하는 탭이면 내용만 덮어씀
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${title}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows.map(r => r.map(String)) },
  });
}
