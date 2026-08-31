import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey, verifyBridgeApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import { createSpreadsheet, SheetCreationError } from "@/lib/sheetCreation";
import { SHEET_ALLOWED_AGENT_TYPES } from "@/lib/sheetLimits";

interface CreateBody {
  agentType?: string;
  folderName?: string;
  title?: string;
  sourcePrompt?: string;
  tabs?: string[];
  data?: Record<string, string[][]>;
  dryRun?: boolean;
}

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_JSON" },
      { status: 400 },
    );
  }

  const resolvedAgentType = String(body.agentType ?? "agent-1");
  if (!SHEET_ALLOWED_AGENT_TYPES.includes(resolvedAgentType as (typeof SHEET_ALLOWED_AGENT_TYPES)[number])) {
    return NextResponse.json(
      { error: "agentType은 agent-1 | agent-2 중 하나여야 합니다.", code: "INVALID_AGENT_TYPE" },
      { status: 400 },
    );
  }
  if (!verifyBridgeApiKey(req, resolvedAgentType) && !verifyAgentApiKey(req)) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  try {
    const result = await createSpreadsheet({ ...body, agentType: resolvedAgentType });
    if (result.dryRun) {
      await auditLog({
        method: "POST",
        endpoint: "/api/agent/sheets/create",
        action: "create_spreadsheet",
        dryRun: true,
        payload: {
          title: result.finalTitle,
          folderPath: result.folderPath,
          tabs: result.safeTabs,
          totalCells: result.totalCells,
        },
      });
      return NextResponse.json({
        dryRun: true,
        preview: { title: result.finalTitle, folderPath: result.folderPath, tabs: result.safeTabs },
        message: "dryRun=true: 실제 생성되지 않았습니다.",
      });
    }

    await auditLog({
      method: "POST",
      endpoint: "/api/agent/sheets/create",
      action: "create_spreadsheet",
      dryRun: false,
      payload: {
        title: result.finalTitle,
        folderPath: result.folderPath,
        tabs: result.safeTabs,
        totalCells: result.totalCells,
      },
      result: { spreadsheetId: result.spreadsheetId, url: result.url, folderPath: result.folderPath },
    });

    return NextResponse.json({
      spreadsheetId: result.spreadsheetId,
      url: result.url,
      title: result.finalTitle,
      folderPath: result.folderPath,
    }, { status: 201 });
  } catch (err) {
    if (err instanceof SheetCreationError) {
      return NextResponse.json({ error: err.message, code: err.code, ...err.details }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Google API 오류";
    return NextResponse.json({
      error: "스프레드시트 생성 실패",
      code: "SPREADSHEET_CREATE_FAILED",
      detail: message,
    }, { status: 502 });
  }
}
