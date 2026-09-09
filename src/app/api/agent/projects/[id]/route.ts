import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import { prisma } from "@/lib/prisma";
import { normalizeCompany } from "@/lib/companyFinance";
import { setDefaultProjectAmount } from "@/lib/projectAmounts";

function parseAmount(value: unknown, field: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const amount = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    throw new Error(`${field}은(는) 원 단위 정수로 0 이상 입력해 주세요.`);
  }
  return amount;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { dryRun, ...rest } = body;

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

  const allowed = ["name", "client", "company", "announceDate", "deadline", "status", "progress", "assignee", "memo"] as const;
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in rest) data[key] = rest[key];
  }
  if ("company" in data && data.company !== null && data.company !== "") {
    const normalizedCompany = normalizeCompany(data.company);
    if (!normalizedCompany) {
      return NextResponse.json({ error: "company는 인포피아, 노바웨이, 클로원 중 하나여야 합니다." }, { status: 400 });
    }
    data.company = normalizedCompany;
  } else if ("company" in data) {
    data.company = null;
  }

  let revenueAmount: number | null | undefined;
  let costAmount: number | null | undefined;
  try {
    revenueAmount = parseAmount(rest.revenue, "revenue");
    costAmount = parseAmount(rest.cost, "cost");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "금액이 올바르지 않습니다." }, { status: 400 });
  }

  const amountChanges = {
    ...(revenueAmount !== undefined ? { revenue: revenueAmount } : {}),
    ...(costAmount !== undefined ? { cost: costAmount } : {}),
  };

  if (dryRun === true) {
    await auditLog({ method: "PATCH", endpoint: `/api/agent/projects/${id}`, action: "update_project", dryRun: true, payload: { id, changes: { ...data, ...amountChanges } } });
    return NextResponse.json({ dryRun: true, before: existing, changes: { ...data, ...amountChanges }, message: "dryRun=true: 실제 저장되지 않았습니다." });
  }

  const project = await prisma.$transaction(async (tx) => {
    const updated = Object.keys(data).length > 0
      ? await tx.project.update({ where: { id }, data })
      : existing;
    if (revenueAmount !== undefined) await setDefaultProjectAmount(id, "revenue", revenueAmount, tx);
    if (costAmount !== undefined) await setDefaultProjectAmount(id, "cost", costAmount, tx);
    return tx.project.findUniqueOrThrow({ where: { id: updated.id } });
  });
  await auditLog({ method: "PATCH", endpoint: `/api/agent/projects/${id}`, action: "update_project", dryRun: false, payload: { id, changes: { ...data, ...amountChanges } }, result: { id: project.id } });

  return NextResponse.json({ project });
}
