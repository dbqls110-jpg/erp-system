import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditMenu, requireMenuAccess } from "@/lib/permissions";
import { PartnerTable } from "./PartnerTable";

export default async function PartnersPage() {
  // 사이드바에서 메뉴를 숨기는 것만으로는 못 막는다. 주소를 직접 치면 그냥 열린다.
  const session = await getServerSession(authOptions);
  await requireMenuAccess(session!.user.id, "partners", session!.user.role);

  const [rows, projects, canEdit] = await Promise.all([
    prisma.partner.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        projects: { include: { project: { select: { id: true, name: true } } } },
        rates: { orderBy: { order: "asc" } },
        payments: {
          orderBy: { createdAt: "desc" },
          include: { project: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.project.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    canEditMenu(session!.user.id, "partners", session!.user.role),
  ]);

  // 화면에 필요한 것만 넘긴다. 관계 객체를 그대로 넘기면 클라이언트 번들이
  // 쓰지도 않는 필드까지 실어 나른다.
  const partners = rows.map((p) => ({
    id: p.id,
    name: p.name,
    job: p.job,
    phone: p.phone,
    rate: p.rate,
    rateUnit: p.rateUnit,
    contractStatus: p.contractStatus,
    settlementType: p.settlementType,
    memo: p.memo,
    projectNames: p.projects.map((x) => x.project.name),
    rates: p.rates.map((rate) => ({
      id: rate.id,
      item: rate.item,
      amount: rate.amount,
      unit: rate.unit,
      memo: rate.memo,
    })),
    payments: p.payments.map((payment) => ({
      id: payment.id,
      item: payment.item,
      amount: payment.amount,
      unit: payment.unit,
      quantity: payment.quantity,
      paidOn: payment.paidOn,
      memo: payment.memo,
      projectId: payment.projectId,
      projectName: payment.project?.name ?? null,
    })),
  }));

  return <PartnerTable initialData={partners} canEdit={canEdit} projects={projects} />;
}
