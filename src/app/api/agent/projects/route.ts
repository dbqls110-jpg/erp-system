import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true, name: true, client: true, status: true, progress: true,
      assignee: true, announceDate: true, deadline: true,
      revenue: true, cost: true, memo: true, createdAt: true, updatedAt: true,
    },
  });

  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, client, announceDate, deadline, assignee, memo, revenue, cost } = body;

  if (!name) return NextResponse.json({ error: "name 필수" }, { status: 400 });

  const project = await prisma.project.create({
    data: {
      name, client: client ?? null, announceDate: announceDate ?? null,
      deadline: deadline ?? null, assignee: assignee ?? null,
      memo: memo ?? null, revenue: revenue ?? null, cost: cost ?? null,
      status: "active",
    },
  });

  return NextResponse.json({ project }, { status: 201 });
}
