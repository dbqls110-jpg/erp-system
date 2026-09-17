/**
 * 공간 제외 목록.
 *
 * 사장님이 "앞으로 팝업이나 공간 DB에 들어오면 자동 제거" 하라고 지정한 곳.
 * 공간 DB 적재(scripts/import-venues.mjs)와 앞으로 붙을 팝업 적재가 모두 이 목록을 거친다.
 * 원본 CSV 에 다시 들어와도 넣지 않고, 이미 들어와 있으면 지운다(scripts/apply-venue-blocklist.mjs).
 *
 * 한 줄에 한 곳. 이름과 도로명 주소 중 하나라도 맞으면 제외한다 —
 * 같은 건물에 이름만 바꿔 다시 올라오는 경우가 있어서 주소도 본다.
 * 주소는 "구 + 도로명 + 건물번호" 까지만 비교한다(층·동·건물명은 표기가 흔들린다).
 *
 * 추가할 때: 네이버 지도 링크를 받으면 naverPlaceId 도 같이 적어 둔다. 나중에 같은 링크가 오면 바로 찾는다.
 */

export const VENUE_BLOCKLIST = [
  { name: "성수포탈", address: "서울 성동구 연무장7길 16", naverPlaceId: "2145764675", addedOn: "2026-09-17" },
  { name: "스퀘어포탈", address: "서울 성동구 연무장7길 16", naverPlaceId: "4480869859", addedOn: "2026-09-17" },
  { name: "노바포탈", address: "서울 성동구 아차산로 116", naverPlaceId: "2146445303", addedOn: "2026-09-17" },
  { name: "엠엠성수", address: "서울 성동구 연무장길 95", naverPlaceId: "1018445746", addedOn: "2026-09-17" },
  { name: "엠엠블루", address: "서울 성동구 연무장길 96", naverPlaceId: "2035171424", addedOn: "2026-09-17" },
  { name: "로데오포탈", address: "서울 강남구 선릉로 827", naverPlaceId: "1388129383", addedOn: "2026-09-17" },
  { name: "더가베 The Gabae", address: "서울 성동구 연무장13길 11", naverPlaceId: "1842642818", addedOn: "2026-09-17" },
  { name: "인포멀스퀘어", address: "서울 성동구 서울숲4길 15-1", naverPlaceId: "1089407141", addedOn: "2026-09-17" },
  { name: "디알씨 홍대", address: "서울 마포구 와우산로 82", naverPlaceId: "1966058011", addedOn: "2026-09-17" },
  { name: "스테이지 엑스 성수 17", address: "서울 성동구 연무장17길 10", naverPlaceId: "2097596831", addedOn: "2026-09-17" },
];

/** 이름 비교용. 공백·괄호·영문 대소문자·특수문자를 무시한다. "더가베 The Gabae" 와 "더가베" 가 같아야 한다. */
export function normalizeVenueName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^0-9a-z가-힣]/g, "");
}

/**
 * 주소 비교용. "서울특별시 성동구 연무장길 96 2층" → "성동구|연무장길|96".
 * 시·도 표기(서울/서울특별시)와 건물번호 뒤(층·동·건물명)는 버린다.
 */
export function addressKey(address) {
  const s = String(address ?? "")
    .replace(/^(서울특별시|서울시|서울|경기도|경기|인천광역시|인천시|인천)\s*/, "")
    .trim();
  const m = s.match(/([가-힣]+(?:시\s*)?[가-힣]*[구군])\s+([가-힣0-9]+(?:로|길))\s*(\d+(?:-\d+)?)/);
  if (!m) return null;
  return `${m[1].replace(/\s+/g, "")}|${m[2]}|${m[3]}`;
}

const BLOCK_NAMES = new Set(VENUE_BLOCKLIST.map((b) => normalizeVenueName(b.name)));
// 영문 병기를 뺀 한글 이름도 받는다: "더가베 The Gabae" → "더가베", "스테이지 엑스 성수 17" 은 그대로.
for (const b of VENUE_BLOCKLIST) {
  const koreanOnly = normalizeVenueName(b.name.replace(/[A-Za-z]+/g, ""));
  if (koreanOnly.length >= 3) BLOCK_NAMES.add(koreanOnly);
}
const BLOCK_ADDRESSES = new Set(VENUE_BLOCKLIST.map((b) => addressKey(b.address)).filter(Boolean));
const BLOCK_PLACE_IDS = new Set(VENUE_BLOCKLIST.map((b) => b.naverPlaceId).filter(Boolean));

/**
 * 제외 대상이면 이유 문자열, 아니면 null.
 * @param {{name?: string|null, address?: string|null, naverPlaceId?: string|null}} venue
 */
export function blockedReason(venue) {
  if (venue.naverPlaceId && BLOCK_PLACE_IDS.has(String(venue.naverPlaceId))) return `네이버 플레이스 ${venue.naverPlaceId}`;
  const n = normalizeVenueName(venue.name);
  if (n && BLOCK_NAMES.has(n)) return `이름 "${venue.name}"`;
  // 이름이 제외 이름으로 시작하는 경우(예: "엠엠블루 2층", "노바포탈 B홀")
  for (const bn of BLOCK_NAMES) {
    if (bn.length >= 4 && n.startsWith(bn)) return `이름 "${venue.name}" (${bn} 계열)`;
  }
  const a = addressKey(venue.address);
  if (a && BLOCK_ADDRESSES.has(a)) return `주소 "${venue.address}"`;
  return null;
}

export function isBlockedVenue(venue) {
  return blockedReason(venue) !== null;
}
