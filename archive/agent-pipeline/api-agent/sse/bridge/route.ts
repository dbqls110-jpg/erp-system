import { NextRequest } from "next/server";
import { verifyBridgeApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

// GET /api/agent/sse/bridge?agentType=xxx
// Python 브릿지 전용 SSE 엔드포인트.
// 새 pending 작업이 생기면 즉시 job 이벤트로 push.
// 브릿지가 꺼져 있으면 작업은 DB에 pending 으로 남고, 재연결 시 /pending 으로 복구.

const PING_INTERVAL_MS = 25_000;  // 25초 ping (Render 30초 idle timeout 회피)
const POLL_INTERVAL_MS = 1_500;   // 신규 job 감지 폴링 (SSE는 push지만 DB poll로 구현)
const MAX_STREAM_MS    = 55 * 60 * 1000; // 55분 후 재연결 유도 (Render 60분 limit)

const ALLOWED = ["hermes", "marketer"] as const;

export async function GET(req: NextRequest) {
  const agentType = req.nextUrl.searchParams.get("agentType") ?? "";
  if (!ALLOWED.includes(agentType as (typeof ALLOWED)[number])) {
    return new Response("agentType은 hermes | marketer", { status: 400 });
  }

  if (!verifyBridgeApiKey(req, agentType)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const send = (ctrl: ReadableStreamDefaultController, event: string, data: unknown) => {
    if (closed) return;
    try {
      ctrl.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    } catch {
      closed = true;
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      send(controller, "connected", { agentType, ts: Date.now() });

      const deadline = Date.now() + MAX_STREAM_MS;
      let lastSeenId: string | null = null;
      let pingTimer: ReturnType<typeof setInterval> | null = null;
      let pollTimer: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (pingTimer) clearInterval(pingTimer);
        if (pollTimer) clearInterval(pollTimer);
      };

      // ping 타이머
      pingTimer = setInterval(() => {
        if (closed || Date.now() > deadline) {
          cleanup();
          if (!closed) {
            send(controller, "reconnect", { message: "55분 경과, 재연결하세요." });
            controller.close();
            closed = true;
          }
          return;
        }
        send(controller, "ping", { ts: Date.now() });
      }, PING_INTERVAL_MS);

      // 신규 job 감지 폴
      pollTimer = setInterval(async () => {
        if (closed) { cleanup(); return; }

        try {
          const where = {
            agentType,
            status: "pending" as const,
            ...(lastSeenId ? { id: { gt: lastSeenId } } : {}),
          };

          const jobs = await prisma.agentJob.findMany({
            where,
            orderBy: { createdAt: "asc" as const },
            take: 5,
            select: { id: true, agentType: true, userId: true, input: true, createdAt: true },
          });

          for (const job of jobs) {
            send(controller, "job", {
              jobId: job.id,
              agentType: job.agentType,
              userId: job.userId,
              input: job.input,
              createdAt: job.createdAt,
            });
            lastSeenId = job.id;
          }
        } catch {
          // DB 오류는 무시하고 계속
        }
      }, POLL_INTERVAL_MS);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
