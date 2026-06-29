import { NextResponse } from "next/server";

const NOTION_VERSION = "2022-06-28";

async function notionFetch(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${process.env.NOTION_API_KEY}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export async function GET() {
  const apiKey = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_CALENDAR_DB_ID;

  if (!apiKey || !dbId) {
    return NextResponse.json({ ok: false, error: "env vars missing" });
  }

  // 1. DB 스키마 조회
  const db = await notionFetch(`/databases/${dbId}`);
  if (db.object === "error") {
    return NextResponse.json({ ok: false, step: "retrieve", error: db.message });
  }

  const propNames = Object.entries(db.properties ?? {}).map(([name, p]) => ({
    name,
    type: (p as { type: string }).type,
  }));

  // 2. 쿼리 테스트
  const today = new Date().toISOString().split("T")[0];
  const query = await notionFetch(`/databases/${dbId}/query`, "POST", {
    filter: { property: propNames.find(p => p.type === "date")?.name ?? "날짜", date: { on_or_after: today } },
    page_size: 3,
  });

  return NextResponse.json({
    ok: true,
    title: db.title?.[0]?.plain_text,
    properties: propNames,
    queryOk: query.object !== "error",
    queryError: query.object === "error" ? query.message : undefined,
    sampleCount: query.results?.length ?? 0,
  });
}
