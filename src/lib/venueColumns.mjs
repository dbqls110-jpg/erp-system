/**
 * 공간 DB 원본 칸 정리 — ERP 가 적재할 때 스스로 한다.
 *
 * DB팀 파일은 157열인데 빈 열, 값이 똑같은 열, 옛 스크랩 시절 열, 작업 이력 열이 섞여 있다
 * (2026-09-21 점검). DB팀에 고쳐 달라고 하는 대신 ERP 가 적재하면서 정리한다 — 원본 파일은
 * 드라이브 스냅샷에 그대로 남으니 잃는 것은 없고, DB팀이 열을 바꾸지 않아도 ERP 쪽은 깔끔하다.
 *
 * 컬럼으로 옮기는 칸(import-venues.mjs 의 MAPPED)은 여기서 손대지 않는다. 이 함수는 그 나머지,
 * 즉 raw 에 담기는 칸만 다룬다.
 */

/**
 * 적재하지 않는 열.
 * - 완전히 빈 열: 플랫폼 · 쉐어잇중복 · 통화내용 · 접근제한_표준
 * - 수용_min/max: 수용_적용min/max 와 100% 같고, 적용 쪽이 이미 컬럼(capacityMin/Max)으로 들어간다.
 */
export const DROP = new Set(["플랫폼", "쉐어잇중복", "통화내용", "접근제한_표준", "수용_min", "수용_max"]);

/**
 * 값이 같은 열 쌍. 왼쪽은 버리고 오른쪽만 남긴다.
 * 오른쪽이 비어 있고 왼쪽에만 값이 있으면 옮겨 담는다(합집합).
 */
export const MERGE_INTO = {
  주말이용_표준: "주말이용",
  구_대관방법: "대관방법",
  구_전화: "전화_원본",
  근거출처: "출처URL",
  공간명: "대표공간명",
};

/** 옛 스크랩 시절 열(1,697행에만 있음). "칸명: 값" 으로 이어 붙여 원문_메모 한 칸으로. */
export const LEGACY = ["좌석/수용/면적", "공간 웹사이트 링크", "대관비", "대관가능 날짜(or 대관방법)", "비고"];
export const LEGACY_TARGET = "원문_메모";

/** DB팀 작업 이력. 공간 정보가 아니라 raw._작업로그 아래로 내린다(시트에는 안 나간다). */
export const WORKLOG = new Set([
  "탐색시도", "검증_요금", "검증_대관방법", "검증_전화", "검증_링크", "검증_메모", "구_요금",
  "시트_가능일정", "시트_이용제한", "시트_확인필요", "조건_확인일", "영리_검증일", "접속상태",
  "최초수집일", "유형_원본", "전화_원본", "주말_원문",
]);
export const WORKLOG_KEY = "_작업로그";

const blank = (v) => v === undefined || v === null || String(v).trim() === "";

/**
 * raw 한 건을 정리한다. 원본 객체는 건드리지 않고 새 객체를 돌려준다.
 * @param {Record<string, unknown>} raw
 */
export function normalizeVenueRaw(raw) {
  const out = {};
  const log = {};
  const legacyParts = [];

  for (const [k, v] of Object.entries(raw ?? {})) {
    if (k === WORKLOG_KEY) { Object.assign(log, v ?? {}); continue; } // 이미 정리된 행을 다시 돌려도 안전
    if (DROP.has(k)) continue;
    if (k in MERGE_INTO) {
      const target = MERGE_INTO[k];
      if (!blank(v) && blank(raw[target]) && blank(out[target])) out[target] = v;
      continue;
    }
    if (LEGACY.includes(k)) { if (!blank(v)) legacyParts.push(`${k}: ${String(v).trim()}`); continue; }
    if (k === LEGACY_TARGET) { if (!blank(v)) legacyParts.unshift(String(v).trim()); continue; }
    if (WORKLOG.has(k)) { if (!blank(v)) log[k] = v; continue; }
    out[k] = v;
  }
  // 합집합으로 옮겨 담을 때 원본 target 이 나중에 나올 수 있으므로 여기서 다시 확인한다.
  for (const [src, target] of Object.entries(MERGE_INTO)) {
    if (!blank(raw?.[src]) && blank(out[target])) out[target] = raw[src];
  }
  if (legacyParts.length) out[LEGACY_TARGET] = [...new Set(legacyParts)].join(" | ");
  // 전화_원본 은 작업로그로 내려가지만 구_전화 를 합칠 자리이기도 하다 — 합친 값도 로그에 둔다.
  if (!blank(out["전화_원본"])) { log["전화_원본"] = out["전화_원본"]; delete out["전화_원본"]; }
  if (Object.keys(log).length) out[WORKLOG_KEY] = log;
  return out;
}

/** 시트로 내보낼 때 건너뛸 raw 키인지. 작업 로그처럼 밑줄로 시작하는 키는 내부용이다. */
export function isInternalRawKey(key) {
  return key.startsWith("_");
}
