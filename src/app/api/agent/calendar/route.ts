import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";
import { getHermesUser } from "@/lib/agentApi";

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const { searchParams } = req.nextUrl;
  const year = parseInt(searchParams.get("year") ?? String(now.getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(now.getMonth() + 1));
  const monthStr = String(month).padStart(2, "0");
  const start = `${year}-${monthStr}-01`;
  const end = `${year}-${monthStr}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

  const events = await prisma.calendarEvent.findMany({
    where: { date: { gte: start, lte: end } },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({ year, month, events });
}

export async function POST(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, date, endDate, color, createdBy } = body;

  if (!title) return NextResponse.json({ error: "title은 필수입니다." }, { status: 400 });
  if (!date) return NextResponse.json({ error: "date는 필수입니다." }, { status: 400 });

  let userId = createdBy;
  if (!userId) {
    const hermesUser = await getHermesUser();
    if (!hermesUser) {
      return NextResponse.json({
        error: "Hermes 계정(ybsw1220@gmail.com)을 찾을 수 없습니다. 먼저 해당 계정으로 ERP에 로그인하여 계정을 생성해주세요.",
      }, { status: 400 });
    }
    userId = hermesUser.id;
  }

  const event = await prisma.calendarEvent.create({
    data: {
      title,
      date,
      endDate: endDate ?? null,
      color: color ?? "blue",
      createdBy: userId,
    },
  });

  return NextResponse.json({ event }, { status: 201 });
}
