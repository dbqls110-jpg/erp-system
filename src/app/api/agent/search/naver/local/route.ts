import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { searchNaverLocal } from "@/lib/naverSearch";

// GET /api/agent/search/naver/local?q=검색어&display=5
// Naver Local Search API — 키/시크릿은 응답·로그에 절대 출력 금지
export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q = (searchParams.get("q") ?? "").trim();
  const displayRaw = parseInt(searchParams.get("display") ?? "5");
  const display = isNaN(displayRaw) ? 5 : Math.min(Math.max(1, displayRaw), 5);

  if (!q) return NextResponse.json({ error: "q(검색어)는 필수입니다." }, { status: 400 });
  if (q.length > 200) return NextResponse.json({ error: "검색어는 200자 이하여야 합니다." }, { status: 400 });

  const hasCredentials = !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
  if (!hasCredentials) {
    return NextResponse.json(
      { error: "네이버 API 설정이 없습니다. NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 환경변수를 확인하세요." },
      { status: 503 }
    );
  }

  try {
    const result = await searchNaverLocal(q, display);
    return NextResponse.json({ query: q, display, total: result.total, items: result.items });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "네이버 API 오류";
    return NextResponse.json({ error: "네이버 지역 검색 실패", detail }, { status: 502 });
  }
}
