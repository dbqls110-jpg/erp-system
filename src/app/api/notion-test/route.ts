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

  // 필터 없이 최근 페이지 3개 조회
  const query = await notionFetch(`/databases/${dbId}/query`, "POST", { page_size: 3 });

  if (query.object === "error") {
    return NextResponse.json({ ok: false, error: query.message });
  }

  // 첫 번째 페이지의 실제 속성 확인
  const firstPage = query.results?.[0];
  const firstProps = firstPage
    ? Object.entries(firstPage.properties ?? {}).map(([name, p]) => ({
        name,
        type: (p as { type: string }).type,
      }))
    : [];

  return NextResponse.json({
    ok: true,
    totalResults: query.results?.length ?? 0,
    firstPageProperties: firstProps,
    firstPageTitle: firstPage?.properties?.Name?.title?.[0]?.plain_text ?? "(없음)",
  });
}
