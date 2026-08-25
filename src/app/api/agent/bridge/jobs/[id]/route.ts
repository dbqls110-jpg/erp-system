import { NextRequest, NextResponse } from "next/server";
import { hasAnyBridgeCredential, verifyBridgeApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

interface Body {
  status?: "processing" | "completed" | "error";
  output?: string;
  errorMsg?: string;
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

  // 이미 끝난 작업은 갱신하지 않는다. 브릿지가 재시작하며 같은 보고를 두 번 보내도
  // 결과가 덮이지 않게 한다.
  const updated = await prisma.agentJob.updateMany({
    where: { id, status: { notIn: ["completed", "error"] } },
    data: {
      status: next,
      ...(body.output !== undefined ? { output: body.output.slice(0, 20000) } : {}),
      ...(body.errorMsg !== undefined ? { errorMsg: body.errorMsg.slice(0, 2000) } : {}),
      ...(done ? { completedAt: new Date() } : {}),
    },
  });

  return NextResponse.json({ ok: true, updated: updated.count });
}
