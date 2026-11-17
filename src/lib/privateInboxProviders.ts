import { google, type gmail_v1 } from "googleapis";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { decryptFromStorage } from "@/lib/googleClient";
import { MAILBOX_CALLBACK, MAIL_BODY_LIMIT, MAIL_IMPORT_LIMIT } from "@/lib/privateInboxPolicy";

export function mailboxOAuthClient() {
  return new google.auth.OAuth2({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET,
    redirectUri: MAILBOX_CALLBACK, transporterOptions: { timeout: 12_000, retry: false } });
}
export function gmailPlainText(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data && part.body.data.length <= 3_000_000) return Buffer.from(part.body.data, "base64url").toString("utf8").slice(0, MAIL_BODY_LIMIT);
  return part.parts?.map(gmailPlainText).filter(Boolean).join("\n").slice(0, MAIL_BODY_LIMIT) ?? "";
}
function naverClient(email: string, password: string) {
  return new ImapFlow({ host: "imap.naver.com", port: 993, secure: true,
    auth: { user: email, pass: password }, logger: false, disableAutoIdle: true,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    maxLiteralSize: 2_100_000, maxResponseSize: 3_000_000 });
}
export async function verifyNaverMailbox(email: string, password: string, folder: string) {
  const client = naverClient(email, password);
  client.on("error", () => {});
  const timer = setTimeout(() => client.close(), 20_000);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder, { readOnly: true });
    lock.release();
  } catch { throw Error("네이버 연결에 실패했습니다. IMAP 사용 설정·앱 비밀번호·메일함 이름을 확인해 주세요."); }
  finally { clearTimeout(timer); client.close(); }
}

type MailboxAccount = { provider: string; email: string; folder: string; encryptedCredential: string };
export interface ImportedMail { providerMessageId: string; subject: string; senderName: string; senderEmail: string; body: string; receivedAt: Date }
async function readGmail(account: MailboxAccount): Promise<ImportedMail[]> {
  const oauth = mailboxOAuthClient();
  oauth.setCredentials({ refresh_token: decryptFromStorage(account.encryptedCredential) });
  const gmail = google.gmail({ version: "v1", auth: oauth });
  const signal = AbortSignal.timeout(45_000);
  const labels = await gmail.users.labels.list({ userId: "me" }, { timeout: 12_000, retry: false, signal });
  const label = labels.data.labels?.find(row => row.name === account.folder || row.id === account.folder);
  if (!label?.id) throw Error("mailbox_label_missing");
  const response = await gmail.users.messages.list({ userId: "me", labelIds: [label.id], q: "newer_than:30d", maxResults: MAIL_IMPORT_LIMIT, includeSpamTrash: false }, { timeout: 12_000, retry: false, signal });
  const output: ImportedMail[] = [];
  // 최대 4개씩 요청. 제한 없는 병렬 다운로드와 전체 메일함 순회를 하지 않는다.
  const ids = response.data.messages ?? [];
  for (let offset = 0; offset < ids.length; offset += 4) {
    const batch = await Promise.all(ids.slice(offset, offset + 4).map(async row => {
      if (!row.id) return null;
      const { data } = await gmail.users.messages.get({ userId: "me", id: row.id, format: "full" }, { timeout: 12_000, retry: false, maxContentLength: 3_000_000, signal });
      if (!data.id || !data.internalDate || !data.labelIds?.includes(label.id ?? "")) return null;
      const receivedAt = new Date(Number(data.internalDate));
      if (!Number.isFinite(receivedAt.getTime()) || receivedAt.getTime() < Date.now() - 30 * 86400_000) return null;
      const headers = data.payload?.headers ?? [];
      const from = headers.find(h => h.name?.toLowerCase() === "from")?.value?.slice(0, 500) ?? "";
      const parsed = await simpleParser(`From: ${from.replace(/[\r\n]/g, "")}\r\n\r\n`);
      return { providerMessageId: data.id, subject: headers.find(h => h.name?.toLowerCase() === "subject")?.value?.slice(0, 300) || "(제목 없음)",
        senderName: parsed.from?.value[0]?.name?.slice(0, 200) ?? "", senderEmail: parsed.from?.value[0]?.address?.slice(0, 254) ?? "",
        body: gmailPlainText(data.payload) || "텍스트 본문이 없습니다. 원본 메일함에서 확인해 주세요.", receivedAt };
    }));
    for (const mail of batch) if (mail) output.push(mail);
  }
  return output;
}
async function readNaver(account: MailboxAccount): Promise<ImportedMail[]> {
  const client = naverClient(account.email, decryptFromStorage(account.encryptedCredential));
  client.on("error", () => {});
  const timer = setTimeout(() => client.close(), 50_000);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(account.folder, { readOnly: true });
    try {
      const mailbox = client.mailbox;
      if (!mailbox) throw Error("mailbox_missing");
      const since = new Date(Date.now() - 30 * 86400_000);
      const found = await client.search({ since }, { uid: true });
      const ids = found ? found.sort((a, b) => b - a).slice(0, MAIL_IMPORT_LIMIT) : [];
      const output: ImportedMail[] = [];
      if (!ids.length) return output;
      const metadata = await client.fetchAll(ids, { uid: true, size: true, internalDate: true }, { uid: true });
      const smallIds = metadata.filter(row => typeof row.size === "number" && row.size <= 2_000_000).map(row => row.uid);
      if (!smallIds.length) return output;
      for (const uid of smallIds) {
        const message = await client.fetchOne(uid, { uid: true, source: true, internalDate: true }, { uid: true });
        if (!message) continue;
        if (!message.source || !message.internalDate) continue;
        const parsed = await simpleParser(message.source, { skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true });
        const receivedAt = new Date(message.internalDate);
        if (!Number.isFinite(receivedAt.getTime()) || receivedAt < since) continue;
        output.push({ providerMessageId: `${mailbox.uidValidity}:${message.uid}`, subject: parsed.subject?.slice(0, 300) || "(제목 없음)",
          senderName: parsed.from?.value[0]?.name?.slice(0, 200) ?? "", senderEmail: parsed.from?.value[0]?.address?.slice(0, 254) ?? "",
          body: parsed.text?.slice(0, MAIL_BODY_LIMIT) || "텍스트 본문이 없습니다. 원본 메일함에서 확인해 주세요.", receivedAt });
      }
      return output;
    } finally { lock.release(); }
  } finally { clearTimeout(timer); client.close(); }
}
export async function readMailboxMessages(account: MailboxAccount): Promise<ImportedMail[]> {
  if (account.provider === "gmail") return readGmail(account);
  if (account.provider === "naver") return readNaver(account);
  throw Error("unsupported_mailbox");
}
