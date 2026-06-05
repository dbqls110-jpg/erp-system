import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { dryRun, ...rest } = body;

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

  const allowed = ["name", "client", "announceDate", "deadline", "status", "progress", "assignee", "memo", "revenue", "cost"] as const;
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in rest) data[key] = rest[key];
  }

  if (dryRun === true) {
    await auditLog({ method: "PATCH", endpoint: `/api/agent/projects/${id}`, action: "update_project", dryRun: true, payload: { id, changes: data } });
    return NextResponse.json({ dryRun: true, before: existing, changes: data, message: "dryRun=true: 실제 저장되지 않았습니다." });
  }

  const project = await prisma.project.update({ where: { id }, data });
  await auditLog({ method: "PATCH", endpoint: `/api/agent/projects/${id}`, action: "update_project", dryRun: false, payload: { id, changes: data }, result: { id: project.id } });

  return NextResponse.json({ project });
}
