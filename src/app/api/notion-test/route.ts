import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";

export async function GET() {
  const apiKey = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_CALENDAR_DB_ID;

  if (!apiKey || !dbId) {
    return NextResponse.json({ ok: false, error: "env vars missing", hasApiKey: !!apiKey, hasDbId: !!dbId });
  }

  const c = new Client({ auth: apiKey });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = await (c.databases.retrieve as any)({ database_id: dbId });
    const propNames = Object.entries(db.properties ?? {}).map(([name, p]) => ({
      name,
      type: (p as { type: string }).type,
    }));
    return NextResponse.json({ ok: true, title: db.title?.[0]?.plain_text, properties: propNames });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
