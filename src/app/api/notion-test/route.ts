import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";

export async function GET() {
  const apiKey = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_CALENDAR_DB_ID;

  if (!apiKey || !dbId) {
    return NextResponse.json({ ok: false, error: "env vars missing", hasApiKey: !!apiKey, hasDbId: !!dbId });
  }

  const c = new Client({ auth: apiKey });

  // 1. databases.retrieve로 data_sources 목록 가져오기
  let dataSources: Array<{ id: string }> = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = await c.databases.retrieve({ database_id: dbId }) as any;
    dataSources = db.data_sources ?? [];
  } catch (e) {
    return NextResponse.json({ ok: false, step: "databases.retrieve", error: String(e) });
  }

  if (dataSources.length === 0) {
    return NextResponse.json({ ok: false, error: "data_sources 없음", tip: "Notion 연결 권한 확인 필요" });
  }

  // 2. 각 data source에서 속성 조회
  const results = [];
  for (const ds of dataSources) {
    try {
      const dsData = await c.dataSources.retrieve({ data_source_id: ds.id });
      const props = Object.entries(dsData.properties).map(([name, p]) => ({
        name,
        type: (p as { type: string }).type,
      }));
      results.push({ id: ds.id, ok: true, properties: props });
    } catch (e) {
      results.push({ id: ds.id, ok: false, error: String(e) });
    }
  }

  return NextResponse.json({ ok: true, dbId, dataSources: results });
}
