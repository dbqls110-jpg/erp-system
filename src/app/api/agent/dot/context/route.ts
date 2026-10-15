import { prisma } from "@/lib/prisma";
import { verifyDotApiKey, getActiveDotAccount, dotErrorResponse } from "@/lib/dotAuth";
import { koreanDateKey } from "@/lib/dateFormat";

// The sole credential gets a bounded read budget per server process. Verified
// before DB access. Multi-instance scaling should move this budget to shared storage.
let readWindow = { startedAt: 0, count: 0 };

export async function GET(request: Request) {
  if (!verifyDotApiKey(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const now = Date.now();
  if (now - readWindow.startedAt > 60_000) readWindow = { startedAt: now, count: 0 };
  if (++readWindow.count > 30) return Response.json({ error: "조회 요청이 너무 많습니다." }, { status: 429, headers: { "Retry-After": "60" } });
  try {
    await getActiveDotAccount();
    const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
    if (!Number.isInteger(page) || page < 1 || page > 10000) return Response.json({ error: "page가 올바르지 않습니다." }, { status: 400 });
    const [total, projects, failedReplies, bridges] = await Promise.all([
      prisma.project.count(),
      prisma.project.findMany({ skip: (page - 1) * 100, take: 100, orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: { id: true, name: true, status: true, assignee: true, deadline: true, progress: true, revenue: true, cost: true,
          checklistItems: { select: { content: true, isDone: true }, orderBy: { order: "asc" } },
          files: { select: { name: true, category: true, createdAt: true } },
          amounts: { select: { kind: true, amount: true, sourceFileName: true } } } }),
      prisma.venueDaMessage.count({ where: { authorType: "admin", deliveryStatus: { in: ["pending", "failed"] } } }),
      prisma.agentBridgeHeartbeat.findMany({ select: { agentType: true, lastSeenAt: true, status: true } }),
    ]);
    return Response.json({ date: koreanDateKey(new Date()), timezone: "Asia/Seoul", total, page, hasMore: page * 100 < total,
      projects, integration: { undeliveredVenueDaReplies: failedReplies, bridges },
      capabilities: { readOnly: true, reportEndpoint: "/api/agent/dot/reports", dailyReportTime: "10:00 Asia/Seoul" } },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return dotErrorResponse(error); }
}
