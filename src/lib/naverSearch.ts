// Naver Local Search API 클라이언트
// 키/시크릿은 절대 로그나 응답에 출력하지 않음

const NAVER_LOCAL_API = "https://openapi.naver.com/v1/search/local.json";

export interface NaverLocalItem {
  title: string;
  category: string;
  telephone: string;
  address: string;
  roadAddress: string;
  mapx: string;
  mapy: string;
  link: string;
}

export interface NaverLocalResult {
  total: number;
  items: NaverLocalItem[];
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

// display: 1–5 (Naver local search API 최대 5)
export async function searchNaverLocal(
  query: string,
  display = 5
): Promise<NaverLocalResult> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.");
  }

  const url = new URL(NAVER_LOCAL_API);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(Math.min(Math.max(1, display), 5)));

  const res = await fetch(url.toString(), {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
    // 타임아웃은 Next.js fetch 기본값 사용
  });

  if (!res.ok) {
    // 응답 본문에 키 정보가 포함될 수 있으므로 읽지 않음
    throw new Error(`네이버 API HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    total?: number;
    items?: Record<string, string>[];
  };

  return {
    total: data.total ?? 0,
    items: (data.items ?? []).map((item) => ({
      title: stripHtml(item.title ?? ""),
      category: item.category ?? "",
      telephone: item.telephone ?? "",
      address: item.address ?? "",
      roadAddress: item.roadAddress ?? "",
      mapx: item.mapx ?? "",
      mapy: item.mapy ?? "",
      link: item.link ?? "",
    })),
  };
}

// 이름 정규화 (공백 제거, 소문자, HTML 태그 제거)
export function normalizeName(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

// 주소 토큰 겹침 수 (한국 행정구역 단위 기준)
export function addressOverlap(a: string, b: string): number {
  const tokenize = (s: string) =>
    s
      .replace(/[^\w가-힯]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n;
}

export type NameSimilarity = "exact" | "high" | "none";

// 이름 유사도 판정
export function getNameSimilarity(stored: string, naver: string): NameSimilarity {
  const s = normalizeName(stored);
  const n = normalizeName(naver);
  if (!s || !n) return "none";
  if (s === n) return "exact";
  // 한쪽이 다른쪽을 포함하고 길이 2자 이상
  if (s.length >= 2 && n.length >= 2 && (s.includes(n) || n.includes(s))) return "high";
  return "none";
}
