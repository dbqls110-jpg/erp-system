import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/agent/sse?agentType=hermes&jobId=xxx
// 브라우저용 Server-Sent Events 스트림.
// jobId를 주면 해당 작업의 실시간 델타를 스트리밍.
// jobId 없이 agentType만 주면 해당 agentType의 최신 작업 상태 변경을 감시.

const POLL_INTERVAL_MS = 1500;
const MAX_STREAM_MS = 90_000; // 90초 후 자동 close (클라이언트가 재연결)

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const jobId = searchParams.get("jobId");
  const agentType = searchParams.get("agentType") ?? "hermes";

  const encoder = new TextEncoder();
  let closed = false;
  let lastDeltaSeq = -1;
  let lastStatus = "";

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send("connected", { agentType, jobId, ts: Date.now() });

      const deadline = Date.now() + MAX_STREAM_MS;

      const poll = async () => {
        if (closed || Date.now() > deadline) {
          if (!closed) {
            send("timeout", { message: "재연결하세요." });
            controller.close();
          }
          return;
        }

        try {
          if (jobId) {
            // 특정 작업 추적
            const job = await prisma.agentJob.findUnique({
              where: { id: jobId },
              include: { deltas: { where: { seq: { gt: lastDeltaSeq } }, orderBy: { seq: "asc" } } },
            });

            if (!job) {
              send("error", { message: "작업을 찾을 수 없습니다." });
              controller.close();
              closed = true;
              return;
            }

            if (job.status !== lastStatus) {
              lastStatus = job.status;
              send("status", { jobId, status: job.status, updatedAt: job.updatedAt });
            }

            for (const delta of job.deltas) {
              send("delta", { jobId, seq: delta.seq, content: delta.content });
              lastDeltaSeq = delta.seq;
            }

            if (job.status === "completed") {
              send("completed", { jobId, output: job.output, completedAt: job.completedAt });
              controller.close();
              closed = true;
              return;
            }

            if (job.status === "error") {
              send("error", { jobId, errorMsg: job.errorMsg });
              controller.close();
              closed = true;
              return;
            }
          } else {
            // agentType 최신 작업 감시 (현재 사용자 기준)
            const userId = (session.user as { id?: string }).id;
            if (userId) {
              const latestJob = await prisma.agentJob.findFirst({
                where: { agentType, userId },
                orderBy: { createdAt: "desc" },
              });
              if (latestJob && latestJob.status !== lastStatus) {
                lastStatus = latestJob.status;
                send("status", { jobId: latestJob.id, status: latestJob.status, agentType });
              }
            }
          }
        } catch {
          // DB 오류 시 조용히 재시도
        }

        setTimeout(poll, POLL_INTERVAL_MS);
      };

      setTimeout(poll, POLL_INTERVAL_MS);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
