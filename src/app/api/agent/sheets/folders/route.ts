import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";

const ROOT_FOLDER_NAME = "Hermes 운영 시트";

const AGENT_DEFAULTS = [
  { agentType: "hermes", subfolder: "Hermes" },
  { agentType: "marketer", subfolder: "마케터" },
  { agentType: "report", subfolder: "보고서" },
];

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rootFolderConfigured = Boolean(process.env.GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID);

  return NextResponse.json({
    root: ROOT_FOLDER_NAME,
    rootFolderConfigured,
    agentDefaults: AGENT_DEFAULTS.map(({ agentType, subfolder }) => ({
      agentType,
      subfolder,
      folderPath: `${ROOT_FOLDER_NAME}/${subfolder}`,
    })),
    usage: {
      byAgentType: "agentType 지정 시 해당 기본 폴더 사용. 예: { agentType: \"hermes\" }",
      byFolderName: "folderName 지정 시 해당 이름으로 폴더 사용/생성. 예: { folderName: \"ERP\" }",
      note: "폴더가 없으면 자동 생성됩니다. 날짜별 하위 폴더는 만들지 않습니다.",
    },
  });
}
