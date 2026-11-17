import { verifyMaintenanceApiKey } from "@/lib/maintenanceAuth";
import { deliverNewInquiryEmails } from "@/lib/inquiryEmail";

export async function POST(request: Request) {
  if (!verifyMaintenanceApiKey(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await deliverNewInquiryEmails();
    return Response.json(result, { status: result.status === "needs_attention" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  }
  catch { return Response.json({ error: "Inquiry email check failed" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
