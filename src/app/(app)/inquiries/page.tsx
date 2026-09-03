import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canEditMenu, requireMenuAccess } from "@/lib/permissions";
import { getVisibleInquiries } from "@/lib/inquirySheet";
import { InquiriesKanban } from "./InquiriesKanban";

export default async function InquiriesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  await requireMenuAccess(session.user.id, "inquiries", session.user.role);

  const [inquiries, canEdit] = await Promise.all([
    getVisibleInquiries(),
    canEditMenu(session.user.id, "inquiries", session.user.role),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">문의</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          홈페이지로 들어온 문의를 연락 단계별로 관리합니다. 카드를 더블클릭하면 상세 내용을 볼 수 있습니다.
        </p>
      </div>
      <InquiriesKanban initialInquiries={inquiries} canEdit={canEdit} />
    </div>
  );
}
