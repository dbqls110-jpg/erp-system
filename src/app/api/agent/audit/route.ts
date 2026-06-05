import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
  const onlyDryRun = searchParams.get("dryRun") === "true";

  const logs = await prisma.agentAuditLog.findMany({
    where: onlyDryRun ? { dryRun: true } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ logs, total: logs.length });
}
