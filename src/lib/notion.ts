import { Client } from "@notionhq/client";

let _client: Client | null = null;

function getClient(): Client | null {
  if (!process.env.NOTION_API_KEY) return null;
  return (_client ??= new Client({ auth: process.env.NOTION_API_KEY }));
}

function dbId(): string {
  return process.env.NOTION_CALENDAR_DB_ID ?? "";
}

interface DBProps { titleProp: string; dateProp: string | null }
let _props: DBProps | null = null;

async function resolveProps(): Promise<DBProps | null> {
  const c = getClient();
  if (!c || !dbId()) return null;
  if (_props) return _props;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = await (c.databases.retrieve as any)({ database_id: dbId() });
    let titleProp = "이름";
    let dateProp: string | null = null;
    for (const [name, prop] of Object.entries(db.properties ?? {})) {
      if ((prop as { type: string }).type === "title") titleProp = name;
      if ((prop as { type: string }).type === "date" && !dateProp) dateProp = name;
    }
    return (_props = { titleProp, dateProp });
  } catch {
    return null;
  }
}

export interface NotionEvent {
  notionId: string;
  title: string;
  date: string;
  endDate?: string;
}

export async function getNotionEvents(year: number, month: number): Promise<NotionEvent[]> {
  const c = getClient();
  if (!c || !dbId()) return [];
  const p = await resolveProps();
  if (!p?.dateProp) return [];

  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month)}-01`;
  const end = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;
  const dateProp = p.dateProp;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (c.databases.query as any)({
      database_id: dbId(),
      filter: {
        and: [
          { property: dateProp, date: { on_or_after: start } },
          { property: dateProp, date: { on_or_before: end } },
        ],
      },
    });

    const events: NotionEvent[] = [];
    for (const page of res.results ?? []) {
      if (page.object !== "page") continue;
      const props = page.properties ?? {};
      const titlePropVal = props[p.titleProp];
      const datePropVal = props[dateProp];

      if (!datePropVal || datePropVal.type !== "date" || !datePropVal.date) continue;

      const title =
        titlePropVal?.type === "title"
          ? (titlePropVal.title ?? []).map((t: { plain_text: string }) => t.plain_text).join("") || "Notion 일정"
          : "Notion 일정";

      events.push({
        notionId: page.id,
        title,
        date: datePropVal.date.start.split("T")[0],
        endDate: datePropVal.date.end ? datePropVal.date.end.split("T")[0] : undefined,
      });
    }
    return events;
  } catch {
    return [];
  }
}

export async function createNotionEvent(title: string, date: string, endDate?: string): Promise<string | null> {
  const c = getClient();
  if (!c || !dbId()) return null;
  const p = await resolveProps();
  if (!p) return null;

  try {
    const properties: Record<string, unknown> = {
      [p.titleProp]: { title: [{ text: { content: title } }] },
    };
    if (p.dateProp) {
      properties[p.dateProp] = { date: { start: date, end: endDate ?? null } };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (c.pages.create as any)({ parent: { database_id: dbId() }, properties });
    return page.id ?? null;
  } catch {
    return null;
  }
}

export async function updateNotionEvent(pageId: string, title: string, date: string, endDate?: string): Promise<void> {
  const c = getClient();
  if (!c) return;
  const p = await resolveProps();
  if (!p) return;

  try {
    const properties: Record<string, unknown> = {
      [p.titleProp]: { title: [{ text: { content: title } }] },
    };
    if (p.dateProp) {
      properties[p.dateProp] = { date: { start: date, end: endDate ?? null } };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (c.pages.update as any)({ page_id: pageId, properties });
  } catch {
    // silent
  }
}

export async function archiveNotionEvent(pageId: string): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (c.pages.update as any)({ page_id: pageId, archived: true });
  } catch {
    // silent
  }
}
