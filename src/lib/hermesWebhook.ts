import crypto from "crypto";

const HERMES_KEYWORDS = ["헤르메스", "@헤르메스", "hermes", "@hermes"];
const MARKETER_KEYWORDS = ["마케터", "@마케터", "marketer", "@marketer"];

export function containsHermesKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return HERMES_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

// 멘션된 에이전트 타입 반환 (marketer 우선). 없으면 null
export function detectAgentMention(text: string): "hermes" | "marketer" | null {
  const lower = text.toLowerCase();
  if (MARKETER_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) return "marketer";
  if (HERMES_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) return "hermes";
  return null;
}

export interface HermesWebhookResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export async function dispatchHermesWebhook(
  payload: Record<string, unknown>
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
        "X-ERP-System": "erp",
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
