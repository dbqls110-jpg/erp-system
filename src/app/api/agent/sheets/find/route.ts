import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { makeDriveClient, resolveEffectiveFolderId } from "@/lib/googleClient";

function scoreMatch(name: string, q: string): number {
  const n = name.toLowerCase();
  const nCompact = n.replace(/\s+/g, "");
  const qLower = q.toLowerCase().trim();
  const qCompact = qLower.replace(/\s+/g, "");

  if (n === qLower) return 5;           // 완전 일치
  if (nCompact === qCompact) return 4;  // 공백 무시 완전 일치
  if (n.startsWith(qLower)) return 3;   // 앞부분 일치
  if (n.includes(qLower)) return 2;     // 포함 (원문)
  if (nCompact.includes(qCompact)) return 1; // 포함 (공백 무시)
  return 0;
}

async function checkFolderRelation(
  folderId: string,
  rootFolderId: string
): Promise<"root" | "child" | "unknown"> {
  if (folderId === rootFolderId) return "root";
  try {
    const drive = makeDriveClient();
    const meta = await drive.files.get({ fileId: folderId, fields: "parents" });
    const parents = meta.data.parents ?? [];
    return parents.includes(rootFolderId) ? "child" : "unknown";
  } catch {
    return "unknown";
  }
}

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q = (searchParams.get("q") ?? "").trim();
  const folderIdParam = searchParams.get("folderId");
  const folderUrlParam = searchParams.get("folderUrl");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10"), 50);

  if (!q) {
    return NextResponse.json({ error: "q 파라미터가 필요합니다. 예: ?q=고객리스트" }, { status: 400 });
  }

  const effectiveFolderId = resolveEffectiveFolderId(folderIdParam, folderUrlParam);
  if (!effectiveFolderId) {
    return NextResponse.json({
      error: "folderId 또는 folderUrl이 필요하거나, GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID가 설정되어야 합니다.",
    }, { status: 400 });
  }

  const rootFolderId = process.env.GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID ?? "";

  if (rootFolderId) {
    const relation = await checkFolderRelation(effectiveFolderId, rootFolderId);
    if (relation === "unknown") {
      return NextResponse.json({
        error: "지정한 폴더가 Hermes 운영 시트 하위에 없습니다.",
        hint: "folderId 없이 호출하면 root 폴더(Hermes 운영 시트)를 기본으로 사용합니다.",
      }, { status: 403 });
    }
  }

  try {
    const drive = makeDriveClient();

    // 폴더 내 모든 스프레드시트 조회 후 로컬에서 점수 기반 정렬
    const res = await drive.files.list({
      q: `'${effectiveFolderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
      fields: "files(id, name, modifiedTime)",
      pageSize: 100,
      corpora: "user",
      spaces: "drive",
    });

    const allFiles = res.data.files ?? [];

    const scored = allFiles
      .map((f) => ({
        name: f.name ?? "",
        spreadsheetId: f.id ?? "",
        url: `https://docs.google.com/spreadsheets/d/${f.id}/edit`,
        modifiedTime: f.modifiedTime ?? null,
        _score: scoreMatch(f.name ?? "", q),
      }))
      .filter((f) => f._score > 0)
      .sort((a, b) => {
        if (b._score !== a._score) return b._score - a._score;
        return (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? "");
      });

    const matches = scored.slice(0, limit).map(({ _score: _, ...rest }) => rest);

    return NextResponse.json({
      q,
      folderId: effectiveFolderId,
      totalScanned: allFiles.length,
      matchCount: matches.length,
      matches,
      bestMatch: matches[0] ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google Drive API 오류";
    return NextResponse.json({ error: "시트 검색 실패", detail: message }, { status: 502 });
  }
}
