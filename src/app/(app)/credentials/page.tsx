import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditMenu } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CredentialTable } from "./CredentialTable";

// 인증/권한은 (app)/layout.tsx 가 담당한다(세션 없으면 /login, pending 이면 /pending).
export default async function CredentialsPage() {
  const session = await getServerSession(authOptions);
  const canEdit = session?.user?.id
    ? await canEditMenu(session.user.id, "credentials", session.user.role)
    : false;
  const credentials = await prisma.credential.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

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
          <CredentialTable initialData={credentials} canEdit={canEdit} />
        </CardContent>
      </Card>
    </div>
  );
}
