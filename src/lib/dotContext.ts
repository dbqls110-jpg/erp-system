import { prisma } from "@/lib/prisma";
import { DotRequestError, getActiveDotAccount } from "@/lib/dotAuth";
import { koreanDateKey } from "@/lib/dateFormat";

// Shared budget for authenticated API and HTML reads, per server process.
let readWindow = { startedAt: 0, count: 0 };

/** Server-only data reader. Callers must authenticate the dedicated DOT identity first. */
export async function getDotContext(pageValue: string | string[] | undefined) {
  const page = Number(pageValue ?? "1");
  if (Array.isArray(pageValue) || !Number.isInteger(page) || page < 1 || page > 10000) {
    throw new DotRequestError(400, "page가 올바르지 않습니다.");
  }
  const now = Date.now();
  if (now - readWindow.startedAt > 60_000) readWindow = { startedAt: now, count: 0 };
  if (++readWindow.count > 30) throw new DotRequestError(429, "조회 요청이 너무 많습니다. 1분 뒤 다시 확인해 주세요.");
  await getActiveDotAccount();
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
  return { date: koreanDateKey(new Date()), timezone: "Asia/Seoul", total, page, hasMore: page * 100 < total,
    projects, integration: { undeliveredVenueDaReplies: failedReplies, bridges },
    capabilities: { readOnly: true, reportEndpoint: "/api/agent/dot/reports", browserReportPage: "/dot-report", dailyReportTime: "10:00 Asia/Seoul" } };
}
