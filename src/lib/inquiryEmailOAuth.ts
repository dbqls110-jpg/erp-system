import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptForStorage } from "@/lib/googleClient";
import { enableInquiryEmails, requireInquiryEmailOwner } from "@/lib/inquiryEmail";
import { inquiryEmailOAuthClient } from "@/lib/inquiryEmailGmail";
import { INQUIRY_EMAIL_CONFIG_ID as id, INQUIRY_EMAIL_COOKIE, INQUIRY_EMAIL_RECIPIENT, INQUIRY_EMAIL_SCOPE, INQUIRY_EMAIL_STATE_PREFIX } from "@/lib/inquiryEmailPolicy";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 } as const;
export async function beginInquiryEmailOAuth() {
  const userId = await requireInquiryEmailOwner();
  const state = `${INQUIRY_EMAIL_STATE_PREFIX}${randomBytes(32).toString("base64url")}`;
  await prisma.inquiryEmailConfig.upsert({ where: { id },
    create: { id, userId, oauthStateHash: hash(state), oauthExpiresAt: new Date(Date.now() + 600_000) },
    update: { oauthStateHash: hash(state), oauthExpiresAt: new Date(Date.now() + 600_000) } });
  (await cookies()).set(INQUIRY_EMAIL_COOKIE, state, cookieOptions);
  // 이미 등록된 Drive callback URI만 재사용한다. Drive 토큰 저장 로직은 호출하지 않는다.
  return inquiryEmailOAuthClient().generateAuthUrl({ access_type: "offline", prompt: "consent", login_hint: INQUIRY_EMAIL_RECIPIENT,
    scope: ["openid", "email", INQUIRY_EMAIL_SCOPE], state, include_granted_scopes: false });
}
export function isInquiryEmailCallback(request: NextRequest) {
  return request.nextUrl.searchParams.get("state")?.startsWith(INQUIRY_EMAIL_STATE_PREFIX) || request.cookies.has(INQUIRY_EMAIL_COOKIE);
}
export async function consumeInquiryEmailState(state: string | null, cookie: string | undefined, userId: string) {
  if (!state || !cookie || state.length > 100 || !state.startsWith(INQUIRY_EMAIL_STATE_PREFIX)) return false;
  const a = Buffer.from(state), b = Buffer.from(cookie);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const result = await prisma.inquiryEmailConfig.updateMany({ where: { id, userId, oauthStateHash: hash(state), oauthExpiresAt: { gt: new Date() } }, data: { oauthStateHash: null, oauthExpiresAt: null } });
  return result.count === 1;
}
export async function completeInquiryEmailOAuth(request: NextRequest) {
  const destination = new URL("https://erp-system-lojo.onrender.com/inquiries");
  try {
    const userId = await requireInquiryEmailOwner();
    if (!await consumeInquiryEmailState(request.nextUrl.searchParams.get("state"), request.cookies.get(INQUIRY_EMAIL_COOKIE)?.value, userId)) throw Error("oauth_state");
    const code = request.nextUrl.searchParams.get("code");
    if (request.nextUrl.searchParams.has("error") || !code || code.length > 4096) throw Error("oauth_denied");
    const oauth = inquiryEmailOAuthClient();
    const { tokens } = await oauth.getToken(code);
    if (!tokens.id_token || !tokens.refresh_token || !tokens.scope?.split(" ").includes(INQUIRY_EMAIL_SCOPE)) throw Error("oauth_scope");
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: process.env.AUTH_GOOGLE_ID });
    const identity = ticket.getPayload();
    if (identity?.email_verified !== true || identity.email?.toLowerCase() !== INQUIRY_EMAIL_RECIPIENT) throw Error("oauth_account");
    await prisma.inquiryEmailConfig.update({ where: { id }, data: {
      encryptedRefreshToken: encryptForStorage(tokens.refresh_token), connectedAt: new Date(), enabled: false, lastErrorCode: null,
    } });
    const result = await enableInquiryEmails();
    destination.searchParams.set("mail", result.ok ? "enabled" : "needs-attention");
  } catch { destination.searchParams.set("mail", "connection-failed"); }
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(INQUIRY_EMAIL_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
