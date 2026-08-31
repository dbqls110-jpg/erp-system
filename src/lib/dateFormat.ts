/**
 * 서버와 브라우저의 로케일/시간대가 달라도 같은 날짜 문자열을 만들기 위한 포맷터.
 * KST(Asia/Seoul)는 일광절약시간이 없어 UTC+9로 직접 계산해 hydration 차이를 막는다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstParts(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

export function formatKoreanDateTime(value: string | Date) {
  const { year, month, day, hour, minute } = kstParts(value);
  return `${year}.${pad(month)}.${pad(day)} ${pad(hour)}:${pad(minute)}`;
}

export function formatKoreanShortDate(value: string | Date) {
  const { month, day } = kstParts(value);
  return `${month}월 ${day}일`;
}

export function formatKoreanTime(value: string | Date) {
  const { hour, minute } = kstParts(value);
  return `${pad(hour)}:${pad(minute)}`;
}

export function koreanDateKey(value: string | Date) {
  const { year, month, day } = kstParts(value);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function currentKoreanDateKey() {
  return koreanDateKey(new Date());
}
