import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canEditMenu, requireMenuAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getInquiries } from "@/lib/inquirySheet";
import { InquiriesKanban } from "./InquiriesKanban";

export default async function InquiriesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  await requireMenuAccess(session.user.id, "inquiries", session.user.role);

  const [inquiries, canEdit] = await Promise.all([
    getInquiries(),
    canEditMenu(session.user.id, "inquiries", session.user.role),
  ]);
  const projectNames = [...new Set(inquiries.map((inquiry) => inquiry.projectName).filter(Boolean))];
  const projects = projectNames.length === 0
    ? []
    : await prisma.project.findMany({
      where: { name: { in: projectNames } },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
  const projectIdsByName = new Map<string, string>();
  for (const project of projects) {
    // 같은 이름의 프로젝트가 있으면 먼저 만들어진 링크를 유지해 임의의 프로젝트로 바뀌지 않게 한다.
    if (!projectIdsByName.has(project.name)) projectIdsByName.set(project.name, project.id);
  }
  const inquiriesWithProjectIds = inquiries.map((inquiry) => ({
    ...inquiry,
    projectId: inquiry.projectName ? projectIdsByName.get(inquiry.projectName) : undefined,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">문의</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          홈페이지로 들어온 문의를 연락 단계별로 관리합니다. 카드를 더블클릭하면 상세 내용을 볼 수 있습니다.
        </p>
      </div>
      <InquiriesKanban initialInquiries={inquiriesWithProjectIds} canEdit={canEdit} />
    </div>
  );
}
