import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const now = new Date();
  const year = parseInt(searchParams.get("year") ?? String(now.getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(now.getMonth() + 1));
  const monthStr = String(month).padStart(2, "0");
  const start = `${year}-${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

  const [projects, leaves, customEvents] = await Promise.all([
    prisma.project.findMany({
      where: { OR: [{ announceDate: { gte: start, lte: end } }, { deadline: { gte: start, lte: end } }] },
      select: { id: true, name: true, announceDate: true, deadline: true },
    }),
    prisma.leaveRequest.findMany({
      where: { status: "approved", startDate: { gte: start, lte: end } },
      include: { user: { select: { name: true } } },
    }),
    prisma.calendarEvent.findMany({
      where: { date: { gte: start, lte: end } },
    }),
  ]);

  return NextResponse.json({ year, month, projects, leaves, customEvents });
}

export async function POST(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, date, endDate, color, createdByUserId } = body;

  if (!title || !date || !createdByUserId) {
    return NextResponse.json({ error: "title, date, createdByUserId 필수" }, { status: 400 });
  }

  const event = await prisma.calendarEvent.create({
    data: { title, date, endDate: endDate ?? null, color: color ?? "blue", createdBy: createdByUserId },
  });

  return NextResponse.json({ event }, { status: 201 });
}
