import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canEditMenu, requireMenuAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getInquiryNotificationSnapshot } from "@/lib/inquiryNotifications";
import { InquiriesWorkspace } from "./InquiriesWorkspace";
import { Suspense } from "react";
import { InquiryEmailSettings } from "@/components/InquiryEmailSettings";
import { isInquiryEmailOwner } from "@/lib/inquiryEmailPolicy";
import { inquiryKey } from "@/lib/inquiryNotificationKeys";

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<{ mail?: string; inbox?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  await requireMenuAccess(session.user.id, "inquiries", session.user.role);
  const { mail: mailResult, inbox: inboxResult } = await searchParams;

  const [snapshot, canEdit] = await Promise.all([
    getInquiryNotificationSnapshot(),
    canEditMenu(session.user.id, "inquiries", session.user.role),
  ]);
  const { inquiries, registrations: spaceRegistrations, rentals: spaceRentals, keys } = snapshot;
  const projectNames = [...new Set([
    ...inquiries.map((inquiry) => inquiry.projectName),
    ...spaceRentals.map((rental) => rental.projectName),
  ].filter(Boolean))];
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
    inboxKey: inquiryKey("customer", inquiry.identity),
    projectId: inquiry.projectName ? projectIdsByName.get(inquiry.projectName) : undefined,
  }));
  const spaceRentalsWithProjectIds = spaceRentals.map((rental) => ({
    ...rental,
    inboxKey: inquiryKey("space-rental", rental.identity),
    projectId: rental.projectName ? projectIdsByName.get(rental.projectName) : undefined,
  }));

  return (
    <div className="space-y-5">
      {inboxResult === "connection-failed" && <p role="alert" className="text-sm text-red-700">내 메일 연결을 완료하지 못했습니다. Google 승인·Gmail API 설정을 확인하고 ‘내 메일 연결’에서 다시 시도해 주세요.</p>}
      <div className="sr-only">
        <h1 className="text-xl font-semibold tracking-tight">문의</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          홈페이지로 들어온 문의를 연락 단계별로 관리합니다. 카드의 제목을 누르면 상세 내용을 볼 수 있습니다.
        </p>
      </div>
      <InquiriesWorkspace
        initialInquiries={inquiriesWithProjectIds}
        initialSpaceRegistrations={spaceRegistrations.map(row => ({ ...row, inboxKey: inquiryKey("space-registration", row.identity) }))}
        initialSpaceRentals={spaceRentalsWithProjectIds}
        canEdit={canEdit}
        notificationKeys={keys}
      />
      {isInquiryEmailOwner(session.user) && <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-medium">홈페이지 새 문의 이메일 알림 설정</summary><div className="mt-4"><Suspense fallback={<p className="text-sm text-muted-foreground">이메일 알림 설정 확인 중…</p>}><InquiryEmailSettings connectionFailed={mailResult === "connection-failed"} /></Suspense></div></details>}
    </div>
  );
}
