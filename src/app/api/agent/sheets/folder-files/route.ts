import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { makeDriveClient, resolveEffectiveFolderId } from "@/lib/googleClient";

// folderId가 root 또는 root의 직계 자식인지 확인
async function checkFolderRelation(
  folderId: string,
  rootFolderId: string
): Promise<"root" | "child" | "unknown"> {
  if (folderId === rootFolderId) return "root";
  try {
    const drive = makeDriveClient();
    const meta = await drive.files.get({
      fileId: folderId,
      fields: "parents",
    });
    const parents = meta.data.parents ?? [];
    return parents.includes(rootFolderId) ? "child" : "unknown";
  } catch {
    return "unknown";
  }
}

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const folderIdParam = searchParams.get("folderId");
  const folderUrlParam = searchParams.get("folderUrl");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  const effectiveFolderId = resolveEffectiveFolderId(folderIdParam, folderUrlParam);
  if (!effectiveFolderId) {
    return NextResponse.json({
      error: "folderId 또는 folderUrl이 필요하거나, GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID가 설정되어야 합니다.",
    }, { status: 400 });
  }

  const rootFolderId = process.env.GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID ?? "";

  // 보안: root 폴더가 설정된 경우, 해당 폴더가 root 이하인지 확인
  if (rootFolderId) {
    const relation = await checkFolderRelation(effectiveFolderId, rootFolderId);
    if (relation === "unknown") {
      return NextResponse.json({
        error: "지정한 폴더가 Hermes 운영 시트 하위에 없습니다. root 폴더 또는 그 직계 하위 폴더만 조회할 수 있습니다.",
        hint: "folderId 없이 호출하면 root 폴더(Hermes 운영 시트)를 기본으로 사용합니다.",
      }, { status: 403 });
    }
  }

  try {
    const drive = makeDriveClient();

    const res = await drive.files.list({
      q: `'${effectiveFolderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
      fields: "files(id, name, modifiedTime, parents)",
      pageSize: limit,
      orderBy: "modifiedTime desc",
      corpora: "user",
      spaces: "drive",
    });

    const files = (res.data.files ?? []).map((f) => ({
      name: f.name ?? "",
      spreadsheetId: f.id ?? "",
      url: `https://docs.google.com/spreadsheets/d/${f.id}/edit`,
      modifiedTime: f.modifiedTime ?? null,
      parentFolderId: effectiveFolderId,
    }));

    return NextResponse.json({
      folderId: effectiveFolderId,
      isRootFolder: effectiveFolderId === rootFolderId,
      count: files.length,
      files,
      usage: files.length > 0
        ? "반환된 spreadsheetId를 GET /api/agent/sheets/values?spreadsheetId=... 또는 POST /api/agent/sheets/append에 사용하세요."
        : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google Drive API 오류";
    return NextResponse.json({ error: "폴더 파일 조회 실패", detail: message }, { status: 502 });
  }
}
