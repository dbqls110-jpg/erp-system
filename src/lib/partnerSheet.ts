import { makeDriveClientAsOwner, makeSheetsClientAsOwner } from "@/lib/googleClient";
import { prisma } from "@/lib/prisma";

/**
 * 파트너 명부를 구글 시트에 함께 남긴다.
 *
 * 정본은 DB 다. 시트는 사무실에서 눈으로 훑고 전화를 돌리는 용도라, 실패해도
 * 등록 자체를 막지 않는다. 시트 하나 때문에 파트너를 못 만드는 편이 더 나쁘다.
 *
 * 전용 시트를 따로 쓴다. GOOGLE_SHEET_ID 는 "ERP 재무 관리" 를 가리키는데,
 * 재무 시트는 볼 수 있는 사람이 다르고 이미 탭이 수십 개 쌓여 있다. 명부를
 * 거기 끼워 넣으면 권한도 정리도 어그러진다.
 *
 * 시트 위치는 SheetLink 표에 기록한다. 환경변수를 새로 요구하지 않아도 되고,
 * 사이드바의 "구글 시트" 화면에도 자동으로 나타난다.
 */

const SHEET_LINK_NAME = "파트너 명부";
const SHEET_TITLE = "천우영 파트너 명부";
const TAB_NAME = "파트너";
const HEADERS = ["이름", "직업", "거래상태", "단가", "정산방식", "연락처", "진행한 프로젝트", "비고", "등록일"];

/** 드라이브에서 명부를 둘 위치. 이미 정리해 둔 자료 폴더 아래에 넣는다. */
const DRIVE_PATH = ["천우영 시스템", "자료"];

export interface PartnerSheetRow {
  name: string;
  job: string | null;
  contractStatus: string;
  rate: number | null;
  rateUnit: string | null;
  settlementType: string | null;
  phone: string | null;
  projectNames: string[];
  memo: string | null;
  createdAt: Date;
}

function idFromUrl(url: string): string | null {
  return /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(url)?.[1] ?? null;
}

async function findOrCreateFolder(
  drive: Awaited<ReturnType<typeof makeDriveClientAsOwner>>,
  name: string,
  parentId: string | null,
) {
  const escaped = name.replace(/'/g, "\\'");
  const q = [
    `name = '${escaped}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");
  const found = await drive.files.list({ q, fields: "files(id)", spaces: "drive" });
  if (found.data.files?.length) return found.data.files[0].id!;

  const made = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  return made.data.id!;
}

/**
 * 명부 시트를 찾고, 없으면 만든다.
 *
 * 처음 파트너를 등록할 때 한 번만 생성된다. 이후에는 SheetLink 에 남은 주소를
 * 그대로 쓰므로 사장님이 시트를 옮기거나 이름을 바꿔도 따라간다.
 */
async function resolveSpreadsheetId(): Promise<string> {
  const link = await prisma.sheetLink.findFirst({ where: { name: SHEET_LINK_NAME } });
  const existing = link ? idFromUrl(link.url) : null;
  if (existing) return existing;

  const sheets = await makeSheetsClientAsOwner();
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: SHEET_TITLE },
      sheets: [{ properties: { title: TAB_NAME } }],
    },
    fields: "spreadsheetId,spreadsheetUrl",
  });
  const spreadsheetId = created.data.spreadsheetId!;

  // 새 시트는 드라이브 최상위에 생긴다. 정리해 둔 자료 폴더로 옮긴다.
  try {
    const drive = await makeDriveClientAsOwner();
    let parentId: string | null = null;
    for (const segment of DRIVE_PATH) {
      parentId = await findOrCreateFolder(drive, segment, parentId);
    }
    const meta = await drive.files.get({ fileId: spreadsheetId, fields: "parents" });
    await drive.files.update({
      fileId: spreadsheetId,
      addParents: parentId!,
      removeParents: (meta.data.parents ?? []).join(","),
      fields: "id",
    });
  } catch {
    // 옮기지 못해도 시트는 이미 있으므로 계속 간다. 최상위에 남을 뿐이다.
  }

  await prisma.sheetLink.create({
    data: {
      name: SHEET_LINK_NAME,
      url: created.data.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      description: "ERP 파트너 화면에서 자동으로 갱신됩니다. 직접 고치면 다음 등록 때 덮어써집니다.",
      category: "자동 생성",
    },
  });

  return spreadsheetId;
}

function toRow(p: PartnerSheetRow): string[] {
  return [
    p.name,
    p.job ?? "",
    p.contractStatus,
    // 시트는 사람이 훑어보는 곳이라 숫자만 두면 단위를 모른다.
    p.rate === null ? "" : `${p.rate.toLocaleString()}원${p.rateUnit ? ` / ${p.rateUnit}` : ""}`,
    p.settlementType ?? "",
    p.phone ?? "",
    p.projectNames.join(", "),
    p.memo ?? "",
    p.createdAt.toISOString().slice(0, 10),
  ];
}

/**
 * 파트너 전체를 시트에 다시 쓴다.
 *
 * 한 줄씩 붙이지 않고 통째로 덮는다. 수정·삭제까지 줄 단위로 따라가려면 시트의
 * 어느 줄이 어느 파트너인지 대응표가 필요한데, 그 대응은 사람이 시트를 직접
 * 건드리는 순간 깨진다. 통째로 다시 쓰면 DB 와 시트가 항상 같아진다.
 *
 * 실패해도 던지지 않는다. 호출부는 DB 쓰기가 끝난 뒤에 부르므로, 여기서 던지면
 * 이미 저장된 등록이 실패한 것처럼 보인다. 대신 이유를 돌려준다.
 */
export async function syncPartnersToSheet(
  partners: PartnerSheetRow[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const spreadsheetId = await resolveSpreadsheetId();
    const sheets = await makeSheetsClientAsOwner();

    // 탭이 지워졌을 수 있으니 확인하고 없으면 만든다.
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties.title",
    });
    if (!meta.data.sheets?.some((s) => s.properties?.title === TAB_NAME)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: TAB_NAME } } }] },
      });
    }

    // 지운 파트너가 시트에 남지 않도록 먼저 비우고 다시 채운다.
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${TAB_NAME}!A:Z` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB_NAME}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [HEADERS, ...partners.map(toRow)] },
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
