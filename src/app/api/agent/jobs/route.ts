import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import { prisma } from "@/lib/prisma";

const ALLOWED_AGENT_TYPES = ["hermes", "marketer"] as const;

interface SubmitBody {
  agentType?: string;
  userId?: string;
  input?: string;
}

// POST /api/agent/jobs — 새 작업 제출
export async function POST(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: SubmitBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agentType = "hermes", userId, input } = body;

  if (!ALLOWED_AGENT_TYPES.includes(agentType as (typeof ALLOWED_AGENT_TYPES)[number])) {
    return NextResponse.json({ error: "agentType은 hermes | marketer" }, { status: 400 });
  }
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId 필요" }, { status: 400 });
  }
  if (!input || typeof input !== "string" || input.trim().length === 0) {
    return NextResponse.json({ error: "input 필요" }, { status: 400 });
  }
  if (input.length > 4000) {
    return NextResponse.json({ error: "input 최대 4000자" }, { status: 400 });
  }

  const job = await prisma.agentJob.create({
    data: { agentType, userId, input: input.trim() },
  });

  await auditLog({
    method: "POST",
    endpoint: "/api/agent/jobs",
    action: "submit_job",
    dryRun: false,
    payload: { agentType, userId, inputLen: input.length },
    result: { jobId: job.id },
  });

  return NextResponse.json({ jobId: job.id, status: job.status, agentType, createdAt: job.createdAt }, { status: 201 });
}
