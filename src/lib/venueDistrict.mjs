/**
 * 주소를 공간 DB의 자치구 표준 표기로 바꾼다.
 *
 * 주소가 정본이므로 적재와 기존 행 정리에서 같은 함수를 사용해야 한다.
 * 규칙으로 뽑을 수 없는 주소는 null을 반환해 원래 자치구 값을 보존하게 한다.
 */
export function districtFromAddress(address) {
  const a = (address ?? "").replace(/\s+/g, " ").trim();
  if (!a) return null;

  let match = /(서울특별시|서울시|서울)\s+(\S+?구)/.exec(a);
  if (match) return match[2];

  match = /(인천광역시|인천시|인천)\s+(\S+?[구군])/.exec(a);
  if (match) return `인천 ${match[2]}`;

  match = /(경기도|경기)\s+(\S+?시)\s+(\S+?구)/.exec(a);
  if (match) return `경기 ${match[2]} ${match[3]}`;

  match = /(경기도|경기)\s+(\S+?[시군])/.exec(a);
  if (match) return `경기 ${match[2]}`;

  return null;
}

/** 자치구 질의가 해당 venue 표기와 일치하는지 판단한다. */
export function districtMatches(actual, requested) {
  if (!requested || !actual) return !requested;
  if (actual === requested) return true;

  // 인천·경기는 시/구가 한 칸에 들어간다. 도시 prefix 질의는 하위 구도 포함한다.
  return (
    (requested === "인천" || requested.startsWith("경기 ")) &&
    actual.startsWith(`${requested} `)
  );
}

/**
 * 주소로 못 뽑았을 때 자치구 값 자체를 표준형으로 올린다.
 *
 * 주소가 짧거나 비어 규칙이 실패하는 행이 80곳 있었다. 그대로 두면 "부천시" 처럼
 * 접두어 없는 값이 남는데, 질의는 "경기 부천시" 를 만들므로 그 행들이 지역 검색에서
 * 통째로 빠진다. 값만 보고 올릴 수 있는 것은 여기서 올린다.
 */
const GYEONGGI_CITIES = new Set([
  "수원시", "성남시", "고양시", "용인시", "부천시", "안산시", "안양시", "남양주시",
  "화성시", "평택시", "의정부시", "시흥시", "파주시", "김포시", "광명시", "광주시",
  "군포시", "오산시", "이천시", "양주시", "구리시", "안성시", "포천시", "의왕시",
  "하남시", "여주시", "동두천시", "과천시", "양평군", "가평군", "연천군",
]);

export function normalizeDistrictValue(district) {
  const d = (district ?? "").replace(/\s+/g, " ").trim();
  if (!d) return null;
  if (d.startsWith("경기 ") || d.startsWith("인천 ")) return d;
  if (GYEONGGI_CITIES.has(d)) return `경기 ${d}`;
  // "성남시 분당구" 처럼 시+구인데 접두어만 없는 경우
  const pair = /^(\S+[시군])\s+(\S+구)$/.exec(d);
  if (pair && GYEONGGI_CITIES.has(pair[1])) return `경기 ${d}`;
  return d;
}
