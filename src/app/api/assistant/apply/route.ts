import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditMenu } from "@/lib/permissions";
import {
  parseProposals,
  validateProposal,
  type ProposalTarget,
} from "@/lib/assistantProposal";
import {
  moveMessengerFileToCategory,
  moveMessengerFileToProject,
} from "@/lib/googleDrive";

/**
 * 비서가 내놓은 변경 제안을 실제로 적용한다.
 *
 * 적용은 사람이 화면에서 누를 때만 일어난다. AI 는 제안만 하고 쓰지 않는다.
 * 그래서 이 라우트는 "AI 가 뭐라고 했는지" 를 믿지 않는다. job 을 다시 읽어
 * 그 답변 안에 정말 그 제안이 들어 있었는지 확인한 뒤에 적용한다.
 * 그러지 않으면 요청을 손으로 만들어 아무 값이나 쓸 수 있다.
 */

/** 대상마다 어느 메뉴의 수정 권한이 필요한지. */
const MENU_FOR: Record<ProposalTarget, string> = {
  venue: "venues",
  partner: "partners",
  project: "projects",
  drive_file: "messenger",
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { jobId?: unknown; index?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const index = typeof body.index === "number" ? body.index : 0;
  if (!jobId) return NextResponse.json({ error: "jobId 가 필요합니다." }, { status: 400 });

  // 본인 대화의 답변만 적용할 수 있다. 남의 job id 를 넣어도 찾지 못한다.
  const job = await prisma.agentJob.findFirst({
    where: { id: jobId, userId: session.user.id, visibility: "user" },
    select: { output: true, status: true },
  });
  if (!job) return NextResponse.json({ error: "대화를 찾을 수 없습니다." }, { status: 404 });
  if (job.status !== "completed" || !job.output) {
    return NextResponse.json({ error: "아직 답변이 완료되지 않았습니다." }, { status: 409 });
  }

  // 화면이 보내온 내용을 그대로 쓰지 않고 답변에서 다시 뽑는다.
  const proposals = parseProposals(job.output);
  const proposal = proposals[index];
  if (!proposal) {
    return NextResponse.json({ error: "그 제안을 찾을 수 없습니다." }, { status: 404 });
  }

  const menuKey = MENU_FOR[proposal.target];
  if (!(await canEditMenu(session.user.id, menuKey, session.user.role))) {
    return NextResponse.json(
      { error: "이 자료를 고칠 권한이 없습니다." },
      { status: 403 },
    );
  }

  const { accepted, rejected } = validateProposal(proposal);
  if (Object.keys(accepted).length === 0) {
    return NextResponse.json(
      { error: "적용할 수 있는 항목이 없습니다.", rejected },
      { status: 400 },
    );
  }

  try {
    let name: string;
    let moveResult: { name: string; folderPath: string; driveUrl: string } | null = null;
    if (proposal.target === "drive_file") {
      // 파일 ID만 알고 있으면 누구나 다른 파일을 옮길 수 없도록
      // 현재 사용자가 참여한 대화의 첨부파일인지 먼저 확인한다.
      const attachment = await prisma.message.findFirst({
        where: {
          attachmentDriveFileId: proposal.id,
          conversation: {
            OR: [{ participantA: session.user.id }, { participantB: session.user.id }],
          },
        },
        select: { attachmentName: true },
      });
      if (!attachment) {
        return NextResponse.json({ error: "이 첨부파일을 이동할 권한이 없습니다." }, { status: 403 });
      }

      const destination = accepted.destination;
      if (destination === "project") {
        const projectId = typeof accepted.projectId === "string" ? accepted.projectId : "";
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { name: true, createdAt: true },
        });
        if (!project) {
          return NextResponse.json({ error: "지정한 프로젝트를 찾을 수 없습니다." }, { status: 404 });
        }
        const category = typeof accepted.category === "string" ? accepted.category : undefined;
        moveResult = await moveMessengerFileToProject(proposal.id, project, category);
      } else if (destination === "category" && typeof accepted.category === "string") {
        moveResult = await moveMessengerFileToCategory(proposal.id, accepted.category);
      } else {
        return NextResponse.json({ error: "파일을 보낼 폴더가 올바르지 않습니다." }, { status: 400 });
      }
      name = moveResult.name;
    } else if (proposal.target === "venue") {
      const row = await prisma.venue.update({
        where: { id: proposal.id },
        data: accepted,
        select: { name: true },
      });
      name = row.name;
    } else if (proposal.target === "partner") {
      const row = await prisma.partner.update({
        where: { id: proposal.id },
        data: accepted,
        select: { name: true },
      });
      name = row.name;
    } else {
      const row = await prisma.project.update({
        where: { id: proposal.id },
        data: accepted,
        select: { name: true },
      });
      name = row.name;
    }

    // 누가 무엇을 바꿨는지 남긴다. AI 를 거친 변경은 나중에 되짚을 일이 생긴다.
    await prisma.agentAuditLog.create({
      data: {
        method: "POST",
        endpoint: "/api/assistant/apply",
        action: `assistant_apply_${proposal.target}`,
        payload: { jobId, index, id: proposal.id, changes: proposal.changes },
        // Prisma 의 Json 타입은 배열을 그대로 못 받는다. 평범한 값으로 풀어 담는다.
        result: {
          applied: JSON.parse(JSON.stringify(accepted)),
          rejected: rejected.map((r) => `${r.field}: ${r.reason}`),
          by: session.user.id,
          ...(moveResult ? { folderPath: moveResult.folderPath, driveUrl: moveResult.driveUrl } : {}),
        },
      },
    });

    return NextResponse.json({ ok: true, name, applied: accepted, rejected });
  } catch (err) {
    // 대상이 이미 지워졌거나 id 가 틀린 경우가 대부분이다.
    console.error("[assistant apply]", err);
    return NextResponse.json(
      { error: "적용하지 못했습니다. 대상이 사라졌거나 값이 맞지 않습니다." },
      { status: 400 },
    );
  }
}
