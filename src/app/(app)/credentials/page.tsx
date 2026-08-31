import { getServerSession } from "next-auth";
import { requireMenuAccess } from "@/lib/permissions";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditMenu } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CredentialTable } from "./CredentialTable";
import { ShieldCheck } from "lucide-react";

// 인증/권한은 (app)/layout.tsx 가 담당한다(세션 없으면 /login, pending 이면 /pending).
export default async function CredentialsPage() {
  const session = await getServerSession(authOptions);
  // 목록 응답에는 민감한 값 자체를 포함하지 않는다. 아이디·비밀번호는
  // 사용자가 명시적으로 요청한 순간 서버에서 권한 확인과 감사 기록 후 반환한다.
  // 권한 검사가 실패하면 JSX를 반환하지 않으므로 민감한 목록을 함께 조회해도 응답에 포함되지 않는다.
  const [, canEdit, credentialsWithSecrets] = await Promise.all([
    requireMenuAccess(session!.user.id, "credentials", session!.user.role),
    session?.user?.id
      ? canEditMenu(session.user.id, "credentials", session.user.role)
      : Promise.resolve(false),
    prisma.credential.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, company: true, category: true, memo: true, url: true, username: true, password: true },
    }),
  ]);
  const credentials = credentialsWithSecrets.map(({ username, password, ...credential }) => ({
    ...credential,
    username: null,
    password: null,
    hasUsername: Boolean(username),
    hasPassword: Boolean(password),
  }));

  return (
    <div className="space-y-4">
      <div>
        <p className="mt-1 text-sm text-muted-foreground">등록된 인증 정보를 관리합니다.</p>
      </div>

      <Card className="shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
            ID Database
            <span className="ml-2 text-xs font-normal text-muted-foreground">{credentials.length}개</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400" role="note">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>아이디·비밀번호를 표시하거나 복사하면 서버에서 권한을 다시 확인하고 접근 기록을 남깁니다.</p>
          </div>
          <CredentialTable initialData={credentials} canEdit={canEdit} />
        </CardContent>
      </Card>
    </div>
  );
}
