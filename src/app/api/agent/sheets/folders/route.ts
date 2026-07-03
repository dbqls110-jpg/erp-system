import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { getHermesFolderMap } from "@/lib/googleClient";

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const folders = getHermesFolderMap();
  const aliases = Object.keys(folders);

  return NextResponse.json({
    folders: aliases.map((alias) => ({
      alias,
      configured: true,
    })),
    total: aliases.length,
    usage: "POST /api/agent/sheets/create 에서 folder 파라미터로 사용하세요. 예: { \"folder\": \"discord\" }",
    note:
      aliases.length === 0
        ? "GOOGLE_DRIVE_HERMES_*_FOLDER_ID 환경변수가 설정되지 않았습니다. folder 없이 create를 호출하면 서비스 계정 Drive에 생성됩니다."
        : undefined,
  });
}
