import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PartyQuoteError, partyQuoteWhere, requirePartyQuoteAccess } from "@/lib/partyQuotes";
import { streamMessengerFile } from "@/lib/googleDrive";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { target } = await requirePartyQuoteAccess({ kind: request.nextUrl.searchParams.get("kind"), id: request.nextUrl.searchParams.get("partyId") });
    const { id } = await params;
    const file = await prisma.partyQuote.findFirst({ where: { id, ...partyQuoteWhere(target), status: "ready" },
      select: { name: true, mimeType: true, driveFileId: true } });
    if (!file?.driveFileId) return NextResponse.json({ error: "견적서를 찾지 못했습니다." }, { status: 404 });
    const body = await streamMessengerFile(file.driveFileId);
    return new Response(body, { headers: { "Content-Type": file.mimeType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, "%27")}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PartyQuoteError ? error.message : "견적서를 불러오지 못했습니다." },
      { status: error instanceof PartyQuoteError ? error.status : 502 });
  }
}
