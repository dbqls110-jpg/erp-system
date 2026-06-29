import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";

export async function GET() {
  const apiKey = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_CALENDAR_DB_ID;

  if (!apiKey || !dbId) {
    return NextResponse.json({ ok: false, error: "env vars missing", hasApiKey: !!apiKey, hasDbId: !!dbId });
  }

  const c = new Client({ auth: apiKey });

  // 1. dataSources.retrieve 시도
  try {
    const ds = await c.dataSources.retrieve({ data_source_id: dbId });
    const propNames = Object.entries(ds.properties).map(([name, p]) => ({ name, type: (p as { type: string }).type }));
    return NextResponse.json({ ok: true, method: "dataSources.retrieve", title: ds.title?.[0]?.plain_text, properties: propNames });
  } catch (e1) {
    // 2. databases.retrieve 시도 (구버전 fallback)
    try {
      const db = await c.databases.retrieve({ database_id: dbId });
      return NextResponse.json({ ok: true, method: "databases.retrieve (fallback)", id: db.id });
    } catch (e2) {
      return NextResponse.json({
        ok: false,
        dataSourcesError: String(e1),
        databasesError: String(e2),
      });
    }
  }
}
