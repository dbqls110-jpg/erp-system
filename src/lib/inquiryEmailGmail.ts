import { google } from "googleapis";
import { decryptFromStorage } from "@/lib/googleClient";
import { INQUIRY_EMAIL_CALLBACK, inquiryEmailMessage } from "@/lib/inquiryEmailPolicy";

export class InquiryMailError extends Error {
  constructor(public readonly delivery: "not_sent" | "unknown", public readonly code: "auth_required" | "gmail_api_disabled" | "rate_limited" | "provider_unavailable" | "send_rejected" | "delivery_uncertain") { super(code); }
}
export function inquiryEmailOAuthClient() {
  return new google.auth.OAuth2({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET,
    redirectUri: INQUIRY_EMAIL_CALLBACK, transporterOptions: { timeout: 15_000, retry: false } });
}
function httpStatus(error: unknown) {
  if (error && typeof error === "object" && "response" in error && error.response && typeof error.response === "object" && "status" in error.response && typeof error.response.status === "number") return error.response.status;
  return null;
}
function rateLimited(error: unknown) {
  if (!error || typeof error !== "object" || !("response" in error) || !error.response || typeof error.response !== "object" || !("data" in error.response)) return false;
  const data = error.response.data;
  if (!data || typeof data !== "object" || !("error" in data) || !data.error || typeof data.error !== "object" || !("errors" in data.error) || !Array.isArray(data.error.errors)) return false;
  return data.error.errors.some(item => item && typeof item === "object" && "reason" in item && ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "dailyLimitExceeded"].includes(String(item.reason)));
}
export async function sendInquiryEmail(encryptedRefreshToken: string, itemKey: string) {
  const oauth = inquiryEmailOAuthClient();
  try { oauth.setCredentials({ refresh_token: decryptFromStorage(encryptedRefreshToken) }); }
  catch { throw new InquiryMailError("not_sent", "auth_required"); }
  try {
    // 인증 실패와 실제 메시지 전송 도중 응답 유실을 구분한다.
    if (!(await oauth.getAccessToken()).token) throw new InquiryMailError("not_sent", "auth_required");
  } catch (error) {
    if (error instanceof InquiryMailError) throw error;
    const status = httpStatus(error);
    throw new InquiryMailError("not_sent", status === 400 || status === 401 || status === 403 ? "auth_required" : "provider_unavailable");
  }
  try {
    const result = await google.gmail({ version: "v1", auth: oauth }).users.messages.send({
      userId: "me", requestBody: { raw: inquiryEmailMessage(itemKey) },
    }, { timeout: 15_000, retry: false });
    if (!result.data.id) throw new InquiryMailError("unknown", "delivery_uncertain");
    return result.data.id;
  } catch (error) {
    if (error instanceof InquiryMailError) throw error;
    const status = httpStatus(error);
    if (status === 401) throw new InquiryMailError("not_sent", "auth_required");
    if (status === 429 || (status === 403 && rateLimited(error))) throw new InquiryMailError("not_sent", "rate_limited");
    if (status === 403) throw new InquiryMailError("not_sent", "gmail_api_disabled");
    if (status && status >= 400 && status < 500 && status !== 408) throw new InquiryMailError("not_sent", "send_rejected");
    // Gmail send에는 멱등성 키가 없다. 전송 여부가 불명확하면 자동 재발송하지 않는다.
    throw new InquiryMailError("unknown", "delivery_uncertain");
  }
}
