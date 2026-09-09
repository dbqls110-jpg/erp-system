import { getServerSession } from "next-auth";
import { requireMenuAccess } from "@/lib/permissions";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditMenu } from "@/lib/permissions";
import { SheetList } from "./SheetList";

export default async function SheetsPage() {
  const session = await getServerSession(authOptions);
  // 관리자 여부가 아니라 실제 수정 권한을 본다. 관리자 화면에서 팀장에게
  // 수정 권한을 준 경우 버튼이 보여야 하고, 뺐다면 사라져야 한다.
  // 권한 검사가 실패하면 JSX를 반환하지 않으므로 시트 목록을 함께 조회해도 응답에 포함되지 않는다.
  const [, canEdit, sheets] = await Promise.all([
    requireMenuAccess(session!.user.id, "sheets", session!.user.role),
    session?.user?.id
      ? canEditMenu(session.user.id, "sheets", session.user.role)
      : Promise.resolve(false),
    prisma.sheetLink.findMany({ orderBy: [{ category: "asc" }, { order: "asc" }, { createdAt: "asc" }] }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">구글 시트</h1>
        <p className="mt-1 text-sm text-muted-foreground">구글 시트 링크를 확인하고 필요한 문서에 접근하세요.</p>
      </div>
      <SheetList sheets={sheets} isAdmin={canEdit} />
    </div>
  );
}
