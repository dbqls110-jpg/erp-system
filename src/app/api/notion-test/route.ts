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
  const dbId = process.env.NOTION_CALENDAR_DB_ID;
  if (!process.env.NOTION_API_KEY || !dbId) {
    return NextResponse.json({ ok: false, error: "env vars missing" });
  }

  // 현재 달 이벤트 쿼리
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const start = `${year}-${month}-01`;
  const end = `${year}-${month}-${new Date(year, now.getMonth() + 1, 0).getDate()}`;

  const res = await notionFetch(`/databases/${dbId}/query`, "POST", {
    filter: {
      and: [
        { property: "Date", date: { on_or_after: start } },
        { property: "Date", date: { on_or_before: end } },
      ],
    },
    page_size: 10,
  });

  if (res.object === "error") {
    return NextResponse.json({ ok: false, dbId, error: res.message });
  }

  const events = (res.results ?? []).map((p: Record<string, unknown>) => {
    const props = p.properties as Record<string, { type: string; date?: { start: string }; title?: Array<{ plain_text: string }> }>;
    return {
      id: p.id,
      title: props?.Name?.title?.map(t => t.plain_text).join("") || "(제목없음)",
      date: props?.Date?.date?.start ?? null,
    };
  });

  return NextResponse.json({ ok: true, dbId, range: `${start} ~ ${end}`, count: events.length, events });
}
