import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildAssistantPrompt } from "@/lib/assistantPrompt";
import { getAccessibleMenus } from "@/lib/permissions";
import { APPLY_ENDPOINT, restoreProposalStates, type RestoredProposalState } from "@/lib/proposalStates";
import {
  deleteDriveFileAsOwner,
  MAX_MESSENGER_FILE_SIZE,
  uploadMessengerFile,
} from "@/lib/googleDrive";

/**
 * 메신저의 ERP 비서.
 *
 * 질문을 AgentJob 으로 만들면 회사 PC 브릿지가 가져가 Codex 로 답을 만들고
 * 결과를 다시 이 서버에 보고한다. 화면은 그 사이 상태를 물어보며 기다린다.
 *
 * 답을 만드는 쪽(브릿지)은 우리 DB 에 접근할 수 없으므로, 여기서 질문에 맞는
 * ERP 자료를 미리 붙여 보낸다.
 */

/**
 * 끝난 비서 대화를 읽음 처리한다. ids 를 주지 않으면 이 사람의 안 읽은 것 전부.
 * 아직 답이 없는 job 은 건드리지 않는다 — 답이 나중에 와도 배지에 잡혀야 한다.
 */
async function markAssistantJobsSeen(userId: string, ids?: string[]) {
  await prisma.agentJob.updateMany({
    where: {
      userId,
      visibility: "user",
      status: { in: ["completed", "error"] },
      seenAt: null,
      ...(ids ? { id: { in: ids } } : {}),
    },
    data: { seenAt: new Date() },
  });
}

/** 브릿지가 붙어 있는지 판단하는 기준. 이보다 오래 조용하면 꺼진 것으로 본다. */
const BRIDGE_STALE_MS = 3 * 60 * 1000;
const AGENT_TYPE = "agent-1";
const MAX_QUESTION_LEN = 2000;
const INTERNAL_ASSISTANT_MARKERS = [
  "[ERP AI 평가",
  "[배포 검증]",
  "연결 시험이다.",
  "연결 확인 테스트입니다.",
  "연결 테스트",
  "두 번째 연결 테스트",
];

function isInternalAssistantQuestion(question: string) {
  const normalized = question.trim();
  return INTERNAL_ASSISTANT_MARKERS.some((marker) => normalized.startsWith(marker));
}

interface Turn {
  id: string;
  question: string;
  answer: string | null;
  status: string;
  errorMsg: string | null;
  createdAt: string;
  completedAt: string | null;
  attachment: AssistantAttachment | null;
}

export interface AssistantAttachment {
  driveFileId: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
}

function toTurn(job: {
  id: string;
  input?: string;
  userInput: string | null;
  output: string | null;
  status: string;
  errorMsg: string | null;
  createdAt: Date;
  completedAt: Date | null;
  attachmentDriveFileId: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentSizeBytes: number | null;
  attachmentUrl: string | null;
}): Turn {
  const fallbackQuestion = job.input?.split("[질문]").pop()?.trim() ?? job.input ?? "";

  return {
    id: job.id,
    // 새 job은 원문 질문을 쓰고, userInput이 없는 옛 job만 기존 규칙으로 복원한다.
    question: job.userInput ?? fallbackQuestion,
    answer: job.output,
    status: job.status,
    errorMsg: job.errorMsg,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    attachment: job.attachmentDriveFileId
      ? {
          driveFileId: job.attachmentDriveFileId,
          name: job.attachmentName ?? "사진",
          mimeType: job.attachmentMimeType ?? "image/*",
          size: job.attachmentSizeBytes ?? 0,
          // Drive 링크는 대표 계정 권한이 필요하므로 브라우저에는 권한 확인용
          // ERP 스트림 경로만 준다.
          url: `/api/assistant/attachments/${job.id}`,
        }
      : null,
  };
}

/** GET: 내 대화 내역. 화면이 답을 기다릴 때도 이걸 다시 부른다. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = req.nextUrl.searchParams.get("job");

  if (jobId) {
    const [job, heartbeat] = await Promise.all([
      prisma.agentJob.findFirst({
        // job id만 알아도 남의 대화를 읽을 수 없도록 소유자 조건을 함께 건다.
        where: { id: jobId, userId: session.user.id, visibility: "user" },
        select: {
          id: true, input: true, userInput: true, output: true, status: true,
          errorMsg: true, createdAt: true, completedAt: true,
          attachmentDriveFileId: true, attachmentName: true, attachmentMimeType: true,
          attachmentSizeBytes: true, attachmentUrl: true,
        },
      }),
      prisma.agentBridgeHeartbeat.findFirst({
        where: { agentType: { in: [AGENT_TYPE, "hermes"] } },
        orderBy: { lastSeenAt: "desc" },
        select: { lastSeenAt: true, status: true },
      }),
    ]);

    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const turn = toTurn(job);
    if (isInternalAssistantQuestion(turn.question)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 답이 도착한 것을 화면이 받아 갔으니 읽은 것으로 표시한다.
    if (job.status === "completed" || job.status === "error") {
      await markAssistantJobsSeen(session.user.id, [job.id]);
    }

    const online = heartbeat
      ? Date.now() - heartbeat.lastSeenAt.getTime() < BRIDGE_STALE_MS
      : false;

    return NextResponse.json({
      turn,
      bridge: {
        online,
        lastSeenAt: heartbeat?.lastSeenAt.toISOString() ?? null,
      },
    });
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 30), 100);

  const [jobs, heartbeat] = await Promise.all([
    prisma.agentJob.findMany({
      // 남의 질문이 보이면 안 된다. 본인 것만 준다.
      where: { userId: session.user.id, visibility: "user" },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, userInput: true, output: true, status: true,
        errorMsg: true, createdAt: true, completedAt: true,
        attachmentDriveFileId: true, attachmentName: true, attachmentMimeType: true,
        attachmentSizeBytes: true, attachmentUrl: true,
      },
    }),
    prisma.agentBridgeHeartbeat.findFirst({
      where: { agentType: { in: [AGENT_TYPE, "hermes"] } },
      orderBy: { lastSeenAt: "desc" },
      select: { lastSeenAt: true, status: true },
    }),
  ]);

  const legacyJobIds = jobs.filter((job) => job.userInput === null).map((job) => job.id);
  const legacyJobs = legacyJobIds.length
    ? await prisma.agentJob.findMany({
        // 새 job은 큰 input을 목록 응답에서 제외하고, 옛 job에만 폴백용 원문을 읽는다.
        where: { userId: session.user.id, visibility: "user", id: { in: legacyJobIds } },
        select: { id: true, input: true },
      })
    : [];
  const legacyInputById = new Map(legacyJobs.map((job) => [job.id, job.input]));

  const online = heartbeat
    ? Date.now() - heartbeat.lastSeenAt.getTime() < BRIDGE_STALE_MS
    : false;

  // 이미 적용/취소한 제안 카드가 다시 "적용" 버튼을 달고 나오지 않도록 기록을 함께 준다.
  const applyLogs = jobs.length
    ? await prisma.agentAuditLog.findMany({
        where: {
          endpoint: APPLY_ENDPOINT,
          createdAt: { gte: jobs[jobs.length - 1].createdAt },
        },
        select: { action: true, payload: true, createdAt: true },
      })
    : [];
  const proposalStates = restoreProposalStates(jobs.map((job) => job.id), applyLogs);

  const turns = jobs
    .reverse()
    .map((job): Turn & { proposalStates: RestoredProposalState[] } => ({
      ...toTurn({ ...job, input: legacyInputById.get(job.id) }),
      proposalStates: proposalStates.get(job.id) ?? [],
    }))
    .filter((turn) => !isInternalAssistantQuestion(turn.question));

  // 목록을 열어 봤으면 끝난 대화(비서가 먼저 보낸 알림 포함)는 전부 읽은 것이다.
  await markAssistantJobsSeen(session.user.id);

  return NextResponse.json({
    turns,
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

  let question = "";
  let image: File | null = null;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "첨부파일 요청을 읽지 못했습니다." }, { status: 400 });
    }
    const message = form.get("message");
    question = typeof message === "string" ? message.trim() : "";
    const entry = form.get("file");
    if (entry instanceof File && entry.size > 0) image = entry;
  } else {
    let body: { message?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    question = typeof body.message === "string" ? body.message.trim() : "";
  }

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
    where: {
      userId: session.user.id,
      visibility: isInternalAssistantQuestion(question) ? "internal" : "user",
      status: { in: ["pending", "accepted", "processing"] },
    },
    select: { id: true },
  });
  if (pending) {
    return NextResponse.json(
      { error: "앞선 질문의 답을 기다리는 중입니다.", pendingId: pending.id },
      { status: 409 },
    );
  }

  if (image) {
    if (!image.type.startsWith("image/")) {
      return NextResponse.json({ error: "ERP 비서에는 사진 파일만 첨부할 수 있습니다." }, { status: 400 });
    }
    if (image.size > MAX_MESSENGER_FILE_SIZE) {
      return NextResponse.json({ error: "사진은 50MB 이하만 첨부할 수 있습니다." }, { status: 400 });
    }
  }

  // 질문자가 볼 수 있는 메뉴의 자료만 붙인다. 메뉴 권한과 같은 기준이다.
  const allowedMenus = await getAccessibleMenus(session.user.id, session.user.role);
  const { prompt: basePrompt, topics, contextChars } = await buildAssistantPrompt(question, allowedMenus);

  // 사진은 질문을 작성하는 동안에는 브라우저에만 보관한다. 전송을 누른 뒤에만
  // Drive 업로드를 하고, DB 작업 생성에 실패하면 고아 파일도 바로 정리한다.
  let uploaded: Awaited<ReturnType<typeof uploadMessengerFile>> | null = null;
  try {
    if (image) {
      const name = image.name.split(/[\\/]/).pop()?.trim() || "사진";
      uploaded = await uploadMessengerFile({
        buffer: Buffer.from(await image.arrayBuffer()),
        name,
        mimeType: image.type,
        size: image.size,
      });
    }

    const prompt = uploaded
      ? `${basePrompt}\n\n[첨부 사진]\n파일명: ${uploaded.name}\n사진이 이 질문에 함께 첨부되었습니다. 사진 자체를 확인할 수 없는 경우에는 그 사실을 먼저 알리고, 사진에 없는 내용을 추측하지 마세요.`
      : basePrompt;

    const job = await prisma.agentJob.create({
      data: {
        agentType: AGENT_TYPE,
        userId: session.user.id,
        visibility: "user",
        status: "pending",
        input: prompt,
        userInput: question,
        ...(uploaded
          ? {
              attachmentDriveFileId: uploaded.driveFileId,
              attachmentName: uploaded.name,
              attachmentMimeType: uploaded.mimeType,
              attachmentSizeBytes: uploaded.size,
              attachmentUrl: uploaded.driveUrl,
            }
          : {}),
      },
      select: { id: true },
    });

    return NextResponse.json({
      id: job.id,
      topics,
      contextChars,
      attachment: uploaded
        ? {
            driveFileId: uploaded.driveFileId,
            name: uploaded.name,
            mimeType: uploaded.mimeType,
            size: uploaded.size,
            url: `/api/assistant/attachments/${job.id}`,
          }
        : null,
    }, { status: 201 });
  } catch (error) {
    if (uploaded) {
      try {
        await deleteDriveFileAsOwner(uploaded.driveFileId);
      } catch (cleanupError) {
        console.error("[assistant attachment] orphan Drive file cleanup failed", cleanupError);
      }
    }
    throw error;
  }
}
