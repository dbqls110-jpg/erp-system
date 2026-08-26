import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildAssistantPrompt } from "@/lib/assistantPrompt";

/**
 * 메신저의 ERP 비서.
 *
 * 질문을 AgentJob 으로 만들면 회사 PC 브릿지가 가져가 Codex 로 답을 만들고
 * 결과를 다시 이 서버에 보고한다. 화면은 그 사이 상태를 물어보며 기다린다.
 *
 * 답을 만드는 쪽(브릿지)은 우리 DB 에 접근할 수 없으므로, 여기서 질문에 맞는
 * ERP 자료를 미리 붙여 보낸다.
 */

/** 브릿지가 붙어 있는지 판단하는 기준. 이보다 오래 조용하면 꺼진 것으로 본다. */
const BRIDGE_STALE_MS = 3 * 60 * 1000;
const AGENT_TYPE = "agent-1";
const MAX_QUESTION_LEN = 2000;

interface Turn {
  id: string;
  question: string;
  answer: string | null;
  status: string;
  errorMsg: string | null;
  createdAt: string;
  completedAt: string | null;
}

function toTurn(job: {
  id: string;
  input: string;
  output: string | null;
  status: string;
  errorMsg: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): Turn {
  return {
    id: job.id,
    // input 에는 지시문과 ERP 자료가 함께 들어 있다. 화면에는 사람이 쓴 질문만 보여준다.
    question: job.input.split("[질문]").pop()?.trim() ?? job.input,
    answer: job.output,
    status: job.status,
    errorMsg: job.errorMsg,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

/** GET: 내 대화 내역. 화면이 답을 기다릴 때도 이걸 다시 부른다. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 30), 100);

  const [jobs, heartbeat] = await Promise.all([
    prisma.agentJob.findMany({
      // 남의 질문이 보이면 안 된다. 본인 것만 준다.
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, input: true, output: true, status: true,
        errorMsg: true, createdAt: true, completedAt: true,
      },
    }),
    prisma.agentBridgeHeartbeat.findFirst({
      where: { agentType: { in: [AGENT_TYPE, "hermes"] } },
      orderBy: { lastSeenAt: "desc" },
      select: { lastSeenAt: true, status: true },
    }),
  ]);

  const online = heartbeat
    ? Date.now() - heartbeat.lastSeenAt.getTime() < BRIDGE_STALE_MS
    : false;

  return NextResponse.json({
    turns: jobs.reverse().map(toTurn),
    bridge: {
      online,
      // 꺼져 있으면 화면에서 미리 알려 준다. 물어보고 한참 기다리다 실패하는 것보다 낫다.
      lastSeenAt: heartbeat?.lastSeenAt.toISOString() ?? null,
    },
  });
}

/** POST: 질문을 넣는다. 답은 바로 오지 않으므로 job id 만 돌려준다. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = typeof body.message === "string" ? body.message.trim() : "";
  if (!question) return NextResponse.json({ error: "질문을 입력해주세요." }, { status: 400 });
  if (question.length > MAX_QUESTION_LEN) {
    return NextResponse.json(
      { error: `질문이 너무 깁니다. ${MAX_QUESTION_LEN}자 이내로 줄여주세요.` },
      { status: 400 },
    );
  }

  // 같은 사람이 앞선 질문의 답을 기다리는 중이면 새로 받지 않는다. 브릿지가 한 번에
  // 하나씩 처리하므로, 쌓아 두면 마지막 답까지 하염없이 기다리게 된다.
  const pending = await prisma.agentJob.findFirst({
    where: { userId: session.user.id, status: { in: ["pending", "accepted", "processing"] } },
    select: { id: true },
  });
  if (pending) {
    return NextResponse.json(
      { error: "앞선 질문의 답을 기다리는 중입니다.", pendingId: pending.id },
      { status: 409 },
    );
  }

  const { prompt, topics, contextChars } = await buildAssistantPrompt(question);

  const job = await prisma.agentJob.create({
    data: { agentType: AGENT_TYPE, userId: session.user.id, status: "pending", input: prompt },
    select: { id: true },
  });

  return NextResponse.json({ id: job.id, topics, contextChars }, { status: 201 });
}
