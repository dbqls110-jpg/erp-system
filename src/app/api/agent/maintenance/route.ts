import { verifyMaintenanceApiKey } from "@/lib/maintenanceAuth";
import { checkDotMissingReport } from "@/lib/dotMonitor";
import { recoverProjectUploads } from "@/lib/projectUploadRecovery";
import { revalidatePath } from "next/cache";

let lastRequestAt = 0;

export async function POST(request: Request) {
  if (!verifyMaintenanceApiKey(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (Date.now() - lastRequestAt < 60_000) return Response.json({ error: "Retry later" }, { status: 429, headers: { "Retry-After": "60" } });
  lastRequestAt = Date.now();
  const [monitor, recovery] = await Promise.allSettled([checkDotMissingReport(), recoverProjectUploads()]);
  if (recovery.status === "fulfilled" && recovery.value.recovered) {
    for (const path of ["/projects", "/projects/stats", "/company-finance"]) revalidatePath(path, "layout");
  }
  const ok = monitor.status === "fulfilled" && recovery.status === "fulfilled";
  return Response.json({ ok, monitor: monitor.status === "fulfilled" ? monitor.value : { status: "failed" },
    recovery: recovery.status === "fulfilled" ? recovery.value : { status: "failed" } },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
