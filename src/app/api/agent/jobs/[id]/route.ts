import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey, verifyBridgeApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = ["accepted", "processing", "completed", "error"] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

interface PatchBody {
  status?: string;
  output?: string;
  errorMsg?: string;
}

// GET /api/agent/jobs/[id] — 작업 상태 + 델타 조회 (일반 에이전트 키)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const job = await prisma.agentJob.findUnique({
    where: { id },
    include: { deltas: { orderBy: { seq: "asc" } } },
  });

  if (!job) return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });

  return NextResponse.json({
    jobId:       job.id,
    agentType:   job.agentType,
    userId:      job.userId,
    status:      job.status,
    input:       job.input,
    output:      job.output,
    errorMsg:    job.errorMsg,
    claimedAt:   job.claimedAt,
    completedAt: job.completedAt,
    createdAt:   job.createdAt,
    updatedAt:   job.updatedAt,
    deltas: job.deltas.map((d) => ({ seq: d.seq, content: d.content, createdAt: d.createdAt })),
  });
}

// PATCH /api/agent/jobs/[id] — 상태 업데이트 (브릿지 전용 키)
// 브릿지가 자신의 agentType에 맞는 키를 사용해야 한다.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 먼저 job의 agentType을 조회해 키 검증
  const existing = await prisma.agentJob.findUnique({
    where: { id },
    select: { id: true, agentType: true, status: true },
  });
  if (!existing) return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });

  if (!verifyBridgeApiKey(req, existing.agentType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { status, output, errorMsg } = body;

  if (!status || !VALID_STATUSES.includes(status as ValidStatus)) {
    return NextResponse.json({ error: `status는 ${VALID_STATUSES.join(" | ")} 중 하나` }, { status: 400 });
  }

  const now = new Date();
  const updateData: Record<string, unknown> = { status };
  if (status === "accepted")                          updateData.claimedAt   = now;
  if (status === "completed" || status === "error")   updateData.completedAt = now;
  if (output   !== undefined) updateData.output   = String(output).slice(0, 20000);
  if (errorMsg !== undefined) updateData.errorMsg = String(errorMsg).slice(0, 500);

  const updated = await prisma.agentJob.update({ where: { id }, data: updateData });

  await auditLog({
    method: "PATCH",
    endpoint: `/api/agent/jobs/${id}`,
    action: `job_${status}`,
    dryRun: false,
    payload: { jobId: id, agentType: existing.agentType },
    result: { status },
  });

  return NextResponse.json({ jobId: updated.id, status: updated.status, updatedAt: updated.updatedAt });
}
