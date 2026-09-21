import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@/app/pending/SignOutButton";

export default async function InactivePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.active !== false) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-sm border-border shadow-[var(--shadow-subtle)]" style={{ borderRadius: "12px" }}>
        <CardHeader className="pb-4 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-xl">🔒</div>
          <CardTitle className="text-xl font-bold text-foreground">비활성화된 계정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm leading-relaxed text-muted-foreground">
            이 계정은 현재 비활성화되어 ERP와 메신저를 사용할 수 없습니다.
            <br />관리자에게 계정 재활성화를 요청해 주세요.
          </p>
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}
