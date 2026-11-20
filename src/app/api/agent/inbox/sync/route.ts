import { verifyMaintenanceApiKey, verifyPrivateInboxCronKey } from "@/lib/maintenanceAuth";
import { syncDuePrivateMailboxes } from "@/lib/privateInboxAutoSync";

export async function POST(request: Request) {
  if (!verifyPrivateInboxCronKey(request) && !verifyMaintenanceApiKey(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await syncDuePrivateMailboxes();
    return Response.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Mailbox synchronization failed" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
