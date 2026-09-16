import { getServerSession } from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { streamMessengerFile } from "@/lib/googleDrive";

/**
 * 메신저 첨부를 ERP 를 통해 내려준다.
 *
 * 첨부는 대표 계정 Drive 에 올라가므로 Drive 링크를 그대로 열면 상대에게 권한이 없다.
 * 이미지를 말풍선 안에 바로 보여 주려면 서버가 대신 읽어서 넘겨야 한다.
 * 대화 당사자만 볼 수 있다 — 메시지 ID 를 알아도 남의 대화면 404 로 막는다.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messageId } = await params;
  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      conversation: { OR: [{ participantA: session.user.id }, { participantB: session.user.id }] },
    },
    select: { attachmentDriveFileId: true, attachmentMimeType: true, attachmentName: true },
  });
  if (!message?.attachmentDriveFileId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const body = await streamMessengerFile(message.attachmentDriveFileId);
    const headers = new Headers({
      "Content-Type": message.attachmentMimeType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    });
    if (message.attachmentName) {
      headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(message.attachmentName)}`);
    }
    return new Response(body, { headers });
  } catch (err) {
    console.error("[messenger attachment]", err);
    return NextResponse.json({ error: "첨부파일을 불러오지 못했습니다." }, { status: 502 });
  }
}
