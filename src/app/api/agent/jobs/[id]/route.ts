import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey, verifyBridgeApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import { prisma } from "@/lib/prisma";
import { getAgentUser } from "@/lib/agentApi";

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
    select: { id: true, agentType: true, status: true, sourceMessageId: true },
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

  // 이미 종료(completed/error)된 job에는 다시 전이하지 않는다 — 브릿지 재시작/재요청으로 인한
  // PATCH 재전송이 들어와도 count=0이 되어 아무 부작용 없이 조용히 무시된다 (중복 답변 방지).
  const { count } = await prisma.agentJob.updateMany({
    where: { id, status: { notIn: ["completed", "error"] } },
    data: updateData,
  });

  if (count === 0) {
    const current = await prisma.agentJob.findUnique({ where: { id }, select: { status: true, updatedAt: true } });
    return NextResponse.json({
      jobId: id,
      status: current?.status ?? existing.status,
      updatedAt: current?.updatedAt,
      duplicate: true,
    });
  }

  // 메신저에서 온 job이 처음으로 completed 전이했으면 답변 메시지를 생성한다.
  if (status === "completed" && existing.sourceMessageId) {
    try {
      await prisma.$transaction(async (tx) => {
        const srcMessage = await tx.message.findUnique({
          where: { id: existing.sourceMessageId! },
          select: { conversationId: true },
        });
        if (!srcMessage) return;

        const agentUser = await getAgentUser(existing.agentType);
        if (!agentUser) return;

        const replyContent = output !== undefined ? String(output).slice(0, 20000) : "";
        const replyMessage = await tx.message.create({
          data: {
            conversationId: srcMessage.conversationId,
            senderId: agentUser.id,
            content: replyContent,
          },
        });
        await tx.conversation.update({
          where: { id: srcMessage.conversationId },
          data: { lastMessageAt: new Date() },
        });
        await tx.agentMessageProcessing.updateMany({
          where: { messageId: existing.sourceMessageId!, agentType: existing.agentType },
          data: { status: "processed", processedAt: new Date(), resultMessageId: replyMessage.id },
        });
      });
    } catch (e) {
      // 답변 메시지 생성 실패는 job 자체의 completed 전이를 되돌리지 않는다 — 원인만 감사 로그에 남긴다.
      await auditLog({
        method: "PATCH",
        endpoint: `/api/agent/jobs/${id}`,
        action: "job_completed_reply_failed",
        dryRun: false,
        payload: { jobId: id, agentType: existing.agentType },
        result: { error: e instanceof Error ? e.message : "unknown" },
      });
    }
  }

  const updated = await prisma.agentJob.findUnique({ where: { id }, select: { id: true, status: true, updatedAt: true } });

  await auditLog({
    method: "PATCH",
    endpoint: `/api/agent/jobs/${id}`,
    action: `job_${status}`,
    dryRun: false,
    payload: { jobId: id, agentType: existing.agentType },
    result: { status },
  });

  return NextResponse.json({ jobId: id, status: updated?.status, updatedAt: updated?.updatedAt });
}
