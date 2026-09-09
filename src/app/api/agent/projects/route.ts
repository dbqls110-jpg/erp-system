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

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") ?? "";
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const page = Math.max(parseInt(searchParams.get("page") ?? "1"), 1);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (q) where.OR = [
    { name: { contains: q, mode: "insensitive" } },
    { client: { contains: q, mode: "insensitive" } },
    { company: { contains: q, mode: "insensitive" } },
    { assignee: { contains: q, mode: "insensitive" } },
  ];

  const [total, projects] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
      select: {
        id: true, name: true, client: true, status: true, progress: true,
        company: true,
        assignee: true, announceDate: true, deadline: true,
        revenue: true, cost: true, memo: true, createdAt: true, updatedAt: true,
      },
    }),
  ]);

  return NextResponse.json({ projects, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, client, company, announceDate, deadline, status, progress, assignee, memo, revenue, cost, dryRun } = body;

  if (!name) return NextResponse.json({ error: "name은 필수입니다." }, { status: 400 });
  const normalizedCompany = company == null || company === "" ? null : normalizeCompany(company);
  if (company != null && company !== "" && !normalizedCompany) {
    return NextResponse.json({ error: "company는 인포피아, 노바웨이, 클로원 중 하나여야 합니다." }, { status: 400 });
  }

  let revenueAmount: number | null | undefined;
  let costAmount: number | null | undefined;
  try {
    revenueAmount = parseAmount(revenue, "revenue");
    costAmount = parseAmount(cost, "cost");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "금액이 올바르지 않습니다." }, { status: 400 });
  }

  const data = {
    name,
    client: client ?? null,
    company: normalizedCompany,
    announceDate: announceDate ?? null,
    deadline: deadline ?? null,
    status: status ?? "active",
    progress: progress ?? 0,
    assignee: assignee ?? null,
    memo: memo ?? null,
  };

  const amountPreview = {
    ...(revenueAmount !== undefined ? { revenue: revenueAmount } : {}),
    ...(costAmount !== undefined ? { cost: costAmount } : {}),
  };

  if (dryRun === true) {
    await auditLog({ method: "POST", endpoint: "/api/agent/projects", action: "create_project", dryRun: true, payload: { ...data, ...amountPreview } });
    return NextResponse.json({ dryRun: true, preview: { ...data, ...amountPreview }, message: "dryRun=true: 실제 저장되지 않았습니다." });
  }

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({ data });
    if (revenueAmount !== undefined) await setDefaultProjectAmount(created.id, "revenue", revenueAmount, tx);
    if (costAmount !== undefined) await setDefaultProjectAmount(created.id, "cost", costAmount, tx);
    return tx.project.findUniqueOrThrow({ where: { id: created.id } });
  });
  await auditLog({ method: "POST", endpoint: "/api/agent/projects", action: "create_project", dryRun: false, payload: { ...data, ...amountPreview }, result: { id: project.id } });

  return NextResponse.json({ project }, { status: 201 });
}
