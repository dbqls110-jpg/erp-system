import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInquiryReviewer } from "@/lib/inquiryNotifications";
import { encryptForStorage } from "@/lib/googleClient";
import { mailboxOAuthClient } from "@/lib/privateInboxProviders";
import { storePrivateMailbox } from "@/lib/privateInbox";
import { GMAIL_READ_SCOPE, MAILBOX_COOKIE, MAILBOX_STATE_PREFIX, parseMailboxFolder } from "@/lib/privateInboxPolicy";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 } as const;
export async function beginMailboxOAuth(folderInput: unknown) {
  const user = await requireInquiryReviewer(), folder = parseMailboxFolder(folderInput);
  if (await prisma.inboxMailbox.count({ where: { ownerId: user.id } }) >= 10) throw Error("메일은 최대 10개까지 연결할 수 있습니다.");
  const state = `${MAILBOX_STATE_PREFIX}${randomBytes(32).toString("base64url")}`;
  await prisma.inboxOAuthAttempt.deleteMany({ where: { OR: [{ ownerId: user.id }, { expiresAt: { lt: new Date() } }] } });
  await prisma.inboxOAuthAttempt.create({ data: { ownerId: user.id, stateHash: hash(state), folder, expiresAt: new Date(Date.now() + 600_000) } });
  (await cookies()).set(MAILBOX_COOKIE, state, cookieOptions);
  return mailboxOAuthClient().generateAuthUrl({ access_type: "offline", prompt: "consent select_account", scope: ["openid", "email", GMAIL_READ_SCOPE], include_granted_scopes: false, state });
}
export function isMailboxCallback(request: NextRequest) {
  // 각 OAuth 흐름은 state 접두사로 분리한다. 다른 흐름의 쿠키가 남아 있어도 가로채지 않는다.
  return request.nextUrl.searchParams.get("state")?.startsWith(MAILBOX_STATE_PREFIX) === true;
}
export async function completeMailboxOAuth(request: NextRequest) {
  const destination = new URL("https://erp-system-lojo.onrender.com/inquiries");
  try {
    const user = await requireInquiryReviewer();
    const state = request.nextUrl.searchParams.get("state"), cookie = request.cookies.get(MAILBOX_COOKIE)?.value;
    if (!state || !cookie || state.length > 100 || !state.startsWith(MAILBOX_STATE_PREFIX)) throw Error("state_missing");
    const a = Buffer.from(state), b = Buffer.from(cookie);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw Error("state_mismatch");
    const attempt = await prisma.inboxOAuthAttempt.findFirst({ where: { stateHash: hash(state), ownerId: user.id, expiresAt: { gt: new Date() } } });
    if (!attempt) throw Error("state_expired");
    if ((await prisma.inboxOAuthAttempt.deleteMany({ where: { stateHash: hash(state), ownerId: user.id } })).count !== 1) throw Error("state_reused");
    const code = request.nextUrl.searchParams.get("code");
    if (request.nextUrl.searchParams.has("error") || !code || code.length > 4096) throw Error("oauth_denied");
    const oauth = mailboxOAuthClient();
    const { tokens } = await oauth.getToken(code);
    if (!tokens.id_token || !tokens.refresh_token || !tokens.scope?.split(" ").includes(GMAIL_READ_SCOPE)) throw Error("scope_missing");
    const identity = (await oauth.verifyIdToken({ idToken: tokens.id_token, audience: process.env.AUTH_GOOGLE_ID })).getPayload();
    if (!identity?.email || !identity.email_verified) throw Error("identity_missing");
    const email = identity.email.toLowerCase();
    await storePrivateMailbox({ ownerId: user.id, provider: "gmail", email, folder: attempt.folder, encryptedCredential: encryptForStorage(tokens.refresh_token) });
    destination.searchParams.set("inbox", "connected");
  } catch { destination.searchParams.set("inbox", "connection-failed"); }
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(MAILBOX_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
