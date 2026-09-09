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
  if (match) return `서울 ${match[2]}`;

  match = /(인천광역시|인천시|인천)\s+(\S+?[구군])/.exec(a);
  if (match) return `인천 ${match[2]}`;

  match = /(경기도|경기)\s+(\S+?시)\s+(\S+?구)/.exec(a);
  if (match) return `경기 ${match[2]} ${match[3]}`;

  match = /(경기도|경기)\s+(\S+?[시군])/.exec(a);
  if (match) return `경기 ${match[2]}`;

  return null;
}

/**
 * 자치구 질의가 해당 venue 표기와 맞는지 본다.
 *
 * 표기가 "시도 + 시군구" 한 형식이라 규칙도 하나면 된다 — 같거나, 질의로 시작하거나.
 *   "서울 강남구" == "서울 강남구"        완전일치
 *   "서울"       ⊂  "서울 강남구"        시도만 물었을 때
 *   "경기 성남시" ⊂  "경기 성남시 분당구"   시까지만 물었을 때
 * 앞에 공백을 붙여 비교하는 것은 "경기 성남시" 가 "경기 성남시흥구" 같은 이름에
 * 걸리지 않게 하기 위해서다.
 */
export function districtMatches(actual, requested) {
  if (!requested || !actual) return !requested;
  return actual === requested || actual.startsWith(`${requested} `);
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

/** 서울 25개 자치구. 접두어 없이 들어온 값을 올릴 때 쓴다. */
const SEOUL_GU = new Set([
  "종로구", "중구", "용산구", "성동구", "광진구", "동대문구", "중랑구", "성북구",
  "강북구", "도봉구", "노원구", "은평구", "서대문구", "마포구", "양천구", "강서구",
  "구로구", "금천구", "영등포구", "동작구", "관악구", "서초구", "강남구", "송파구",
  "강동구",
]);

export function normalizeDistrictValue(district) {
  const d = (district ?? "").replace(/\s+/g, " ").trim();
  if (!d) return null;
  if (d.startsWith("서울 ") || d.startsWith("경기 ") || d.startsWith("인천 ")) return d;
  if (SEOUL_GU.has(d)) return `서울 ${d}`;
  if (GYEONGGI_CITIES.has(d)) return `경기 ${d}`;
  // "성남시 분당구" 처럼 시+구인데 접두어만 없는 경우
  const pair = /^(\S+[시군])\s+(\S+구)$/.exec(d);
  if (pair && GYEONGGI_CITIES.has(pair[1])) return `경기 ${d}`;
  return d;
}
