import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { streamMessengerFile } from "@/lib/googleDrive";

/**
 * ERP 비서 질문에 붙인 사진을 사용자 권한 안에서 내려준다.
 * Drive 링크를 그대로 노출하지 않고, 질문 소유자만 ERP를 통해 볼 수 있게 한다.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobId } = await params;
  const requestedDriveFileId = new URL(req.url).searchParams.get("driveFileId");
  const job = await prisma.agentJob.findFirst({
    where: { id: jobId, userId: session.user.id, visibility: "user" },
    select: {
      attachmentDriveFileId: true,
      attachmentMimeType: true,
      attachmentName: true,
      attachments: {
        where: requestedDriveFileId ? { driveFileId: requestedDriveFileId } : undefined,
        select: { driveFileId: true, mimeType: true, name: true },
        take: 1,
      },
    },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const selected = job.attachments[0];
  if (requestedDriveFileId && !selected) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const driveFileId = selected?.driveFileId ?? job?.attachmentDriveFileId;
  if (!driveFileId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const body = await streamMessengerFile(driveFileId);
    const headers = new Headers({
      "Content-Type": selected?.mimeType ?? job.attachmentMimeType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    });
    const name = selected?.name ?? job.attachmentName;
    if (name) {
      headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
    }
    return new Response(body, { headers });
  } catch (error) {
    console.error("[assistant attachment]", error);
    return NextResponse.json({ error: "첨부 사진을 불러오지 못했습니다." }, { status: 502 });
  }
}
