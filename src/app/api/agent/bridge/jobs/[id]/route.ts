import { NextRequest, NextResponse } from "next/server";
import { hasAnyBridgeCredential, verifyBridgeApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

interface Body {
  status?: "processing" | "completed" | "error";
  // 브릿지가 null 을 보낼 수 있어 unknown 으로 받고 아래에서 좁힌다.
  output?: unknown;
  errorMsg?: unknown;
}

// PATCH /api/agent/bridge/jobs/[id]
// 브릿지가 진행 상황과 결과를 보고한다.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // 자격증명 없는 요청이 DB 를 건드리지 못하게 조회 전에 거른다.
  if (!hasAnyBridgeCredential(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const job = await prisma.agentJob.findUnique({
    where: { id },
    select: { id: true, agentType: true, status: true },
  });
  if (!job) return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
  if (!verifyBridgeApiKey(req, job.agentType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const next = body.status ?? "processing";
  const done = next === "completed" || next === "error";

  // 문자열이 아닌 값이 와도 죽지 않게 한다. 브릿지가 보내는 output 은 Codex 의
  // stdout 인데, PowerShell 의 Get-Content -Raw 는 빈 파일에서 "" 가 아니라 $null 을
  // 돌려준다. 그대로 오면 null !== undefined 가 참이라 null.slice() 로 500 이 났다.
  const text = (value: unknown, max: number) =>
    typeof value === "string" ? value.slice(0, max) : undefined;
  const output = text(body.output, 20000);
  const errorMsg = text(body.errorMsg, 2000);

  // 이미 끝난 작업은 갱신하지 않는다. 브릿지가 재시작하며 같은 보고를 두 번 보내도
  // 결과가 덮이지 않게 한다.
  const updated = await prisma.agentJob.updateMany({
    where: { id, status: { notIn: ["completed", "error"] } },
    data: {
      status: next,
      ...(output !== undefined ? { output } : {}),
      ...(errorMsg !== undefined ? { errorMsg } : {}),
      ...(done ? { completedAt: new Date() } : {}),
    },
  });

  return NextResponse.json({ ok: true, updated: updated.count });
}
