import { getServerSession } from "next-auth";
import { requireMenuAccess } from "@/lib/permissions";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditMenu } from "@/lib/permissions";
import { SheetList } from "./SheetList";

export default async function SheetsPage() {
  const session = await getServerSession(authOptions);
  await requireMenuAccess(session!.user.id, "sheets", session!.user.role);
  // 관리자 여부가 아니라 실제 수정 권한을 본다. 관리자 화면에서 팀장에게
  // 수정 권한을 준 경우 버튼이 보여야 하고, 뺐다면 사라져야 한다.
  const canEdit = session?.user?.id
    ? await canEditMenu(session.user.id, "sheets", session.user.role)
    : false;
  const sheets = await prisma.sheetLink.findMany({ orderBy: [{ category: "asc" }, { order: "asc" }, { createdAt: "asc" }] });

  return (
    <div className="space-y-4">
      <div><p className="mt-1 text-sm text-muted-foreground">{"\uAD6C\uAE00 \uC2DC\uD2B8 \uB9C1\uD06C\uB97C \uD655\uC778\uD558\uACE0 \uD544\uC694\uD55C \uBB38\uC11C\uC5D0 \uC811\uADFC\uD558\uC138\uC694."}</p></div>
      <SheetList sheets={sheets} isAdmin={canEdit} />
    </div>
  );
}