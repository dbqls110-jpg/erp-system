import { Client, isFullPage } from "@notionhq/client";

let _client: Client | null = null;

function getClient(): Client | null {
  if (!process.env.NOTION_API_KEY) return null;
  return (_client ??= new Client({ auth: process.env.NOTION_API_KEY }));
}

function dsId(): string {
  return process.env.NOTION_CALENDAR_DB_ID ?? "";
}

interface DBProps { titleProp: string; dateProp: string | null }
let _props: DBProps | null = null;

async function resolveProps(): Promise<DBProps | null> {
  const c = getClient();
  if (!c || !dsId()) return null;
  if (_props) return _props;
  try {
    const ds = await c.dataSources.retrieve({ data_source_id: dsId() });
    let titleProp = "이름";
    let dateProp: string | null = null;
    for (const [name, prop] of Object.entries(ds.properties)) {
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
  if (!c || !dsId()) return [];
  const p = await resolveProps();
  if (!p?.dateProp) return [];

  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month)}-01`;
  const end = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;
  const dateProp = p.dateProp;

  try {
    const res = await c.dataSources.query({
      data_source_id: dsId(),
      filter: {
        and: [
          { property: dateProp, date: { on_or_after: start } },
          { property: dateProp, date: { on_or_before: end } },
        ],
      },
    });

    const events: NotionEvent[] = [];
    for (const page of res.results) {
      if (!isFullPage(page)) continue;
      const titlePropVal = page.properties[p.titleProp];
      const datePropVal = page.properties[dateProp];

      if (!datePropVal || datePropVal.type !== "date" || !datePropVal.date) continue;

      const title =
        titlePropVal?.type === "title"
          ? titlePropVal.title.map((t) => t.plain_text).join("") || "Notion 일정"
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
  if (!c || !dsId()) return null;
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
    const page = await c.pages.create({ parent: { data_source_id: dsId() } as any, properties: properties as any });
    return page.id;
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
    await c.pages.update({ page_id: pageId, properties: properties as any });
  } catch {
    // silent
  }
}

export async function archiveNotionEvent(pageId: string): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.pages.update({ page_id: pageId, archived: true });
  } catch {
    // silent
  }
}
