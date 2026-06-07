import crypto from "crypto";

const HERMES_KEYWORDS = ["헤르메스", "@헤르메스", "hermes", "@hermes"];

export function containsHermesKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return HERMES_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

export interface HermesWebhookPayload {
  event: string;
  senderId: string;
  senderName?: string;
  conversationId: string;
  content: string;
  timestamp: string;
}

export interface HermesWebhookResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export async function dispatchHermesWebhook(
  payload: HermesWebhookPayload
): Promise<HermesWebhookResult> {
  const webhookUrl = process.env.HERMES_WEBHOOK_URL;
  const secret = process.env.HERMES_WEBHOOK_SECRET;

  if (!webhookUrl) return { ok: false, error: "HERMES_WEBHOOK_URL not configured" };

  const body = JSON.stringify(payload);
  const timestamp = Date.now().toString();

  // HMAC-SHA256 signature: sha256=hex(hmac(secret, timestamp + "." + body))
  const signature = secret
    ? "sha256=" + crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
    : "sha256=unsigned";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hermes-Signature": signature,
        "X-Hermes-Timestamp": timestamp,
        "X-ERP-System": "천우영 ERP",
      },
      body,
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch error" };
  } finally {
    clearTimeout(timeoutId);
  }
}
