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

function dbId() {
  return process.env.NOTION_CALENDAR_DB_ID ?? "";
}

// 속성명 (Plan Detail DB 기준)
const TITLE_PROP = "Name";
const DATE_PROP = "Date";
const END_DATE_PROP = "End date";

export interface NotionEvent {
  notionId: string;
  title: string;
  date: string;
  endDate?: string;
}

export async function getNotionEvents(year: number, month: number): Promise<NotionEvent[]> {
  if (!process.env.NOTION_API_KEY || !dbId()) return [];

  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month)}-01`;
  const end = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;

  try {
    const res = await notionFetch(`/databases/${dbId()}/query`, "POST", {
      filter: {
        and: [
          { property: DATE_PROP, date: { on_or_after: start } },
          { property: DATE_PROP, date: { on_or_before: end } },
        ],
      },
      page_size: 100,
    });

    if (res.object === "error") return [];

    const events: NotionEvent[] = [];
    for (const page of res.results ?? []) {
      if (page.object !== "page") continue;
      const props = page.properties ?? {};
      const dateProp = props[DATE_PROP];
      if (!dateProp?.date?.start) continue;

      const titleArr = props[TITLE_PROP]?.title ?? [];
      const title = titleArr.map((t: { plain_text: string }) => t.plain_text).join("") || "Notion 일정";
      const endDate = props[END_DATE_PROP]?.date?.start ?? undefined;

      events.push({
        notionId: page.id,
        title,
        date: dateProp.date.start.split("T")[0],
        endDate: endDate ? endDate.split("T")[0] : undefined,
      });
    }
    return events;
  } catch {
    return [];
  }
}

export async function createNotionEvent(title: string, date: string, endDate?: string): Promise<string | null> {
  if (!process.env.NOTION_API_KEY || !dbId()) return null;

  try {
    const properties: Record<string, unknown> = {
      [TITLE_PROP]: { title: [{ text: { content: title } }] },
      [DATE_PROP]: { date: { start: date, end: null } },
    };
    if (endDate) {
      properties[END_DATE_PROP] = { date: { start: endDate, end: null } };
    }

    const page = await notionFetch("/pages", "POST", {
      parent: { database_id: dbId() },
      properties,
    });

    return page.id ?? null;
  } catch {
    return null;
  }
}

export async function updateNotionEvent(pageId: string, title: string, date: string, endDate?: string): Promise<void> {
  if (!process.env.NOTION_API_KEY) return;

  try {
    const properties: Record<string, unknown> = {
      [TITLE_PROP]: { title: [{ text: { content: title } }] },
      [DATE_PROP]: { date: { start: date, end: null } },
      [END_DATE_PROP]: { date: endDate ? { start: endDate, end: null } : null },
    };
    await notionFetch(`/pages/${pageId}`, "PATCH", { properties });
  } catch {
    // silent
  }
}

export async function archiveNotionEvent(pageId: string): Promise<void> {
  if (!process.env.NOTION_API_KEY) return;
  try {
    await notionFetch(`/pages/${pageId}`, "PATCH", { archived: true });
  } catch {
    // silent
  }
}
