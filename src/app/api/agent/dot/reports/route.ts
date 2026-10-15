import { verifyDotApiKey, DotRequestError, dotErrorResponse } from "@/lib/dotAuth";
import { parseDotReport, sendDotReport } from "@/lib/dotReports";

export async function POST(request: Request) {
  if (!verifyDotApiKey(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new DotRequestError(415, "JSON 요청이 필요합니다.");
    // Bound the stream, not only Content-Length, before retaining/parsing it.
    const reader = request.body?.getReader();
    if (!reader) throw new DotRequestError(400, "보고 내용이 필요합니다.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 48_000) { await reader.cancel(); throw new DotRequestError(413, "보고 요청이 너무 큽니다."); }
      chunks.push(value);
    }
    let value: unknown;
    try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new DotRequestError(400, "JSON 형식이 올바르지 않습니다."); }
    const result = await sendDotReport(parseDotReport(value));
    return Response.json(result, { status: result.duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return dotErrorResponse(error); }
}
