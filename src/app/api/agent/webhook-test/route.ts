import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { dispatchHermesWebhook } from "@/lib/hermesWebhook";

export async function POST(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const webhookUrl = process.env.HERMES_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: "HERMES_WEBHOOK_URL not configured" }, { status: 503 });
  }

  const start = Date.now();
  const result = await dispatchHermesWebhook({
    event: "webhook.test",
    senderId: "system",
    conversationId: "test",
    content: "ERP 웹훅 연결 테스트",
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    ...result,
    latencyMs: Date.now() - start,
    configured: {
      hasWebhookUrl: true,
      hasSecret: !!process.env.HERMES_WEBHOOK_SECRET,
    },
  });
}
