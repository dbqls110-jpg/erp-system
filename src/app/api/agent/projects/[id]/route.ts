import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const project = await prisma.project.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.progress !== undefined && { progress: body.progress }),
      ...(body.assignee !== undefined && { assignee: body.assignee }),
      ...(body.deadline !== undefined && { deadline: body.deadline }),
      ...(body.memo !== undefined && { memo: body.memo }),
      ...(body.revenue !== undefined && { revenue: body.revenue }),
      ...(body.cost !== undefined && { cost: body.cost }),
    },
  });

  return NextResponse.json({ project });
}
