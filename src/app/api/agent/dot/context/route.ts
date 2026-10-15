import { dotErrorResponse } from "@/lib/dotAuth";
import { authorizeDotRequest } from "@/lib/dotRequestAuth";
import { getDotContext } from "@/lib/dotContext";

export async function GET(request: Request) {
  try {
    if (!(await authorizeDotRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return Response.json(await getDotContext(new URL(request.url).searchParams.get("page") ?? undefined),
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = dotErrorResponse(error);
    if (response.status === 429) response.headers.set("Retry-After", "60");
    return response;
  }
}
