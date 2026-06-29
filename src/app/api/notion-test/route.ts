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
  if (!process.env.NOTION_API_KEY) {
    return NextResponse.json({ ok: false, error: "env vars missing" });
  }

  // URL에서 찾은 실제 페이지 ID로 직접 조회
  const pageId = "38ed422d7f34802b9db7d94251e69e89";
  const page = await notionFetch(`/pages/${pageId}`);

  if (page.object === "error") {
    return NextResponse.json({ ok: false, error: page.message });
  }

  const props = Object.entries(page.properties ?? {}).map(([name, p]) => ({
    name,
    type: (p as { type: string }).type,
    value: p,
  }));

  return NextResponse.json({
    ok: true,
    pageId: page.id,
    parentType: page.parent?.type,
    parentId: page.parent?.database_id ?? page.parent?.page_id,
    properties: props,
  });
}
