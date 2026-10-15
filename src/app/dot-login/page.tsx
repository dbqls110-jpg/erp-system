"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

/** Credentials must be entered via DOT's private sign-in form, not a conversation. */
export default function DotLoginPage() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return <main className="flex min-h-screen items-center justify-center bg-muted p-4">
    <form className="w-full max-w-sm space-y-4 rounded-xl border bg-background p-6" onSubmit={async (event) => {
      event.preventDefault(); setPending(true); setError("");
      const form = event.currentTarget;
      const data = new FormData(form);
      try {
        const result = await signIn("dot", { secret: data.get("secret"), redirect: false });
        if (result?.ok) { form.reset(); window.location.assign("/dashboard"); }
        else setError("인증키 또는 DOT 계정 설정을 확인해 주세요.");
      } catch { setError("로그인하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
      finally { setPending(false); }
    }}>
      <h1 className="text-lg font-semibold">DOT 업무비서</h1>
      <p className="text-sm text-muted-foreground">조회 전용 계정입니다. 자료 수정·삭제는 허용되지 않습니다.</p>
      <label className="block text-sm" htmlFor="dot-secret">전용 인증키</label>
      <input id="dot-secret" name="secret" type="password" required autoComplete="off" maxLength={256} className="w-full rounded-md border bg-background p-2" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button disabled={pending} className="w-full rounded-md bg-foreground p-2 text-background disabled:opacity-50">{pending ? "확인 중…" : "로그인"}</button>
    </form>
  </main>;
}
