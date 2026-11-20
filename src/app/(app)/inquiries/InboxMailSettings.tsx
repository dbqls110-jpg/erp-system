"use client";

import { useState } from "react";
import { Mail, Plus, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { beginGmailInboxAction, connectNaverInboxAction, disconnectMailboxAction, syncMailboxAction } from "@/app/actions/privateInbox";
import type { PrivateInboxView } from "@/lib/privateInboxPolicy";
import { mailboxErrorMessage } from "@/lib/mailboxErrors";

export function InboxMailSettings({ data, loadState = "loaded", onChange }: { data: PrivateInboxView | null; loadState?: "loading" | "loaded" | "failed"; onChange: (data: PrivateInboxView) => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [provider, setProvider] = useState("gmail");
  async function run(work: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await work(); }
    catch { setMessage("메일 설정 결과를 확인하지 못했습니다. 새로고침 후 다시 확인해 주세요."); }
    finally { setBusy(false); }
  }
  return <details className="rounded-xl border border-border bg-background" id="my-inbox-settings">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="inline-flex flex-wrap items-center gap-2"><Mail className="size-4" aria-hidden="true" />내 메일 연결 <span role="status" className="text-sm font-normal text-muted-foreground">{data ? `${data.mailboxes.length}개 · 본인만 조회` : loadState === "loading" ? "연결 확인 중…" : "연결 조회 실패"}</span></span><Plus className="size-4" aria-hidden="true" />
    </summary>
    <div className="space-y-4 border-t border-border p-4">
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">개인 메일과 연락 메모는 본인만 봅니다. 홈페이지 문의만 기존 담당자와 공유하며, 원본 메일의 읽음·이동·삭제·발송은 하지 않습니다.</p>
      {!data && <p role="status" className="text-sm text-muted-foreground">{loadState === "loading" ? "저장된 메일 연결을 확인하고 있습니다." : "저장된 연결을 확인하지 못했습니다. 아래 ‘다시 불러오기’를 눌러 주세요. 재연결은 필요하지 않을 수 있습니다."}</p>}
      {data?.mailboxes.map(account => <div key={account.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0 text-sm"><p className="break-all font-medium">{account.email}</p><p className="mt-1 text-xs text-muted-foreground">{account.folder} · {account.lastErrorCode ? "수신 확인 필요" : account.lastSyncedAt ? `최근 수신 ${new Date(account.lastSyncedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` : "연결됨 · 아직 수신하지 않음"}</p>{account.lastErrorCode && <p className="mt-1 max-w-prose text-xs leading-relaxed text-destructive">{mailboxErrorMessage(account.lastErrorCode, account.provider)}</p>}</div>
        <div className="flex gap-1"><Button variant="outline" size="sm" disabled={busy} onClick={() => run(async () => {
          const result = await syncMailboxAction(account.id);
          if (result.data) onChange(result.data);
          if (!result.ok) setMessage(result.message);
        })}><RefreshCw className="size-3.5" />수신</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => {
          if (window.confirm("이 ERP에 저장한 메일 사본과 해당 연락 일정을 삭제하고 연결을 해제할까요? 원본 메일은 유지됩니다.")) run(async () => onChange(await disconnectMailboxAction(account.id)));
        }}><Unplug className="size-3.5" />연결 해제</Button></div>
      </div>)}
      {data && <details open={data.mailboxes.length === 0} className="group">
      <summary className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-medium"><Plus className="size-4" aria-hidden="true" />메일 계정 추가</summary>
      <form className="mt-3 grid max-w-3xl gap-3 sm:grid-cols-2" onSubmit={event => {
        event.preventDefault();
        const form = event.currentTarget, fields = new FormData(form);
        const folder = String(fields.get("folder") ?? "");
        if (provider === "gmail") { run(async () => { const url = await beginGmailInboxAction(folder); window.location.href = url; }); return; }
        const input = { email: String(fields.get("email") ?? ""), password: String(fields.get("password") ?? ""), folder };
        form.querySelector<HTMLInputElement>('input[name="password"]')?.setAttribute("value", "");
        const passwordField = form.elements.namedItem("password");
        if (passwordField instanceof HTMLInputElement) passwordField.value = "";
        run(async () => {
          const result = await connectNaverInboxAction(input);
          if (!result.ok) { setMessage(result.message); return; }
          onChange(result.data);
        });
      }}>
        <label className="text-sm font-medium">메일 서비스<select value={provider} onChange={event => { setProvider(event.target.value); setMessage(""); }} className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="gmail">Gmail</option><option value="naver">네이버</option></select></label>
        <label className="text-xs font-medium">가져올 {provider === "gmail" ? "라벨" : "메일함"}<input key={provider} name="folder" required maxLength={100} defaultValue={provider === "gmail" ? "ERP문의" : "INBOX"} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label>
        {provider === "naver" && <><label className="text-xs font-medium">네이버 메일 주소<input name="email" type="email" required autoComplete="username" placeholder="아이디@naver.com" className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label><label className="text-xs font-medium">앱 비밀번호<input name="password" type="password" required autoComplete="off" minLength={8} maxLength={100} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label></>}
        <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">{provider === "gmail" ? "Google이 부여하는 권한은 메일 읽기 권한이며, ERP는 위 라벨의 최근 30일만 가져옵니다. 먼저 Gmail에서 라벨을 만들고 필요한 메일에 지정해 주세요." : "네이버에서 IMAP 사용과 2단계 인증을 켜고 앱 비밀번호를 발급해 입력해 주세요. 일반 로그인 비밀번호는 입력하지 마세요. INBOX는 받은편지함입니다."} 한 번에 최근 40건, 화면에는 최근 200건까지 표시합니다. 네이버는 2MB를 넘는 메일을 제외합니다.</p>
        <Button disabled={busy} type="submit" className="w-fit">{busy ? "연결 중…" : provider === "gmail" ? "Google로 내 메일 연결" : "네이버 메일 연결"}</Button>
      </form>
      </details>}
      {message && <p role="status" className="text-sm text-foreground">{message}</p>}
    </div>
  </details>;
}
