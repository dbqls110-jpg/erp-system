import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") return NextResponse.json([], { status: 403 });

  const requests = await prisma.leaveRequest.findMany({
    where: { status: "pending" },
    select: {
      id: true, type: true, startDate: true, endDate: true,
      startTime: true, endTime: true, days: true, reason: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(requests);
}
