import { NextRequest, NextResponse } from "next/server";
import { verifyBridgeApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

interface DeltaBody {
  seq?: number;
  content?: string;
}

// POST /api/agent/jobs/[id]/delta — 스트리밍 부분 출력 저장 (브릿지 전용)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // job의 agentType 조회 후 브릿지 키 검증
  const job = await prisma.agentJob.findUnique({
    where: { id },
    select: { agentType: true, status: true },
  });
  if (!job) return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });

  if (!verifyBridgeApiKey(req, job.agentType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (job.status === "completed" || job.status === "error") {
    return NextResponse.json({ error: "이미 완료된 작업에는 델타를 추가할 수 없습니다." }, { status: 409 });
  }

  let body: DeltaBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { seq, content } = body;
  if (typeof seq !== "number" || seq < 0) {
    return NextResponse.json({ error: "seq는 0 이상 정수" }, { status: 400 });
  }
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content 필요" }, { status: 400 });
  }

  try {
    const delta = await prisma.agentJobDelta.create({
      data: { jobId: id, seq, content: content.slice(0, 5000) },
    });
    return NextResponse.json({ deltaId: delta.id, jobId: id, seq: delta.seq }, { status: 201 });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "seq 중복" }, { status: 409 });
    }
    throw e;
  }
}
