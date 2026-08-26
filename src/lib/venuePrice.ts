/**
 * 공간 요금을 사람이 믿을 수 있는 형태로 해석한다.
 *
 * 화면 맨 위에 "13원", "120원", "1,820원" 짜리가 줄줄이 올라온 적이 있다. 셋 다
 * 실제 대관료가 아니었다. 13원은 광장의 ㎡당 단가, 1,820원은 전시홀의 ㎡당 일 단가였다.
 * 총액으로 정렬했으니 가장 덜 검증된 행이 정확히 맨 앞자리를 차지한 것이다.
 *
 * 원인은 요금 칸 하나만 보고 그것을 총액으로 취급한 데 있다. 원본 CSV 에는 사실
 * 훨씬 쓸 만한 칸이 두 개 더 있었다.
 *
 *   대관료_4시간환산 — 기준시간이 제각각인 금액을 4시간으로 맞춰 둔 값 (2,361건)
 *   요금_신뢰도      — 근거일치 · 근거없음 · 근거불일치 · 무료(확인) …
 *
 * 그래서 여기서는 세 가지를 한다.
 *   1. 비교·정렬에는 4시간 환산액을 쓴다. 없을 때만 요금 칸으로 내려간다.
 *   2. 얼마나 믿을 수 있는지를 등급으로 매긴다.
 *   3. 못 믿을 값은 "모른다"고 말한다. 그럴듯한 숫자를 지어내지 않는다.
 *
 * 이 판단을 한 곳에 모은 이유는, 화면과 매칭 로직이 각자 요금을 해석하면 목록에
 * 보이는 금액과 순위를 매긴 금액이 서로 달라지기 때문이다.
 */

/** 4시간 환산액의 기준시간. 원본이 이 값으로 맞춰 두었다. */
export const BASE_HOURS = 4;

export interface PricedVenue {
  price: number | null;
  priceBasis: string | null;
  priceSource: string | null;
  baseHours: number | null;
  price4h: number | null;
  priceConfidence: string | null;
  priceMin: number | null;
  priceMax: number | null;
  areaM2: number | null;
}

/**
 * 요금을 얼마나 믿을 수 있는지.
 *
 *   confirmed — 전화로 확인했거나 근거가 일치한다
 *   estimated — 근거는 있으나 우리가 환산한 값이다
 *   unreliable — 근거가 없거나 서로 어긋난다. 숫자를 보여주되 그렇게 말해야 한다
 *   unknown   — 요금을 모른다
 */
export type PriceTrust = "confirmed" | "estimated" | "unreliable" | "unknown";

export interface ResolvedPrice {
  /** 4시간 기준 금액. 모르면 null. */
  amount: number | null;
  trust: PriceTrust;
  /** 진짜 무료인지. 0원과 "모름"을 구분한다. */
  free: boolean;
  /** 사람에게 보여줄 한 줄. 화면은 이 문장을 그대로 쓴다. */
  label: string;
  /** 왜 못 믿는지. 후보 목록의 경고에 붙는다. 믿을 만하면 빈 배열. */
  warnings: string[];
}

/** 원본이 "근거가 어긋난다"고 표시한 값들. 숫자는 있지만 그대로 믿으면 안 된다. */
const UNRELIABLE_CONFIDENCE = [
  "근거없음",
  "근거불일치",
  "근거모순",
  "기준시간 미상",
  "무료(근거없음)",
];

/** 원본이 확인했다고 표시한 값들. */
const CONFIRMED_CONFIDENCE = ["근거일치", "무료(확인)", "무료(근거)", "근거로 교정", "검증교정"];

const has = (value: string | null, list: string[]) =>
  value !== null && list.some((item) => value.includes(item));

/**
 * 요금 칸의 숫자가 ㎡당 단가인지.
 *
 * 기준 칸에 ㎡ 가 적혀 있으면 확실하다. 문제는 적혀 있지 않은 경우다 —
 * 광화문광장 13원이 그랬다. 대관 공간의 총액이 1,000원 미만인 경우는 사실상
 * 없으므로, 그런 값은 단가로 보고 총액에서 뺀다. 싸 보이게 두는 쪽이 훨씬 위험하다.
 */
function looksPerArea(venue: PricedVenue): boolean {
  if (venue.priceBasis && /㎡|m2|제곱|평당/i.test(venue.priceBasis)) return true;
  return venue.price !== null && venue.price > 0 && venue.price < 1000;
}

const won = (n: number) => `${n.toLocaleString()}원`;

/**
 * 요금을 4시간 기준 금액과 신뢰도로 정리한다.
 *
 * 순서가 중요하다. 무료를 먼저 가려내지 않으면 0원이 "모름"으로 묻히고,
 * ㎡당 단가를 먼저 가려내지 않으면 13원이 총액 행세를 한다.
 */
export function resolvePrice(venue: PricedVenue): ResolvedPrice {
  const confidence = venue.priceConfidence;
  const warnings: string[] = [];

  // ── 무료 ──────────────────────────────────────────────
  // "무료(확인)" 은 근거를 확인한 무료다. "무료(근거없음)" 은 근거가 없다는 뜻이라
  // 무료로 취급하면 안 된다 — 실제로 하이커 그라운드는 무료 표기인데 시간당 13만원이었다.
  if (confidence?.startsWith("무료") && !confidence.includes("근거없음")) {
    return { amount: 0, trust: "confirmed", free: true, label: "무료", warnings: [] };
  }

  // ── 4시간 환산액 ──────────────────────────────────────
  // 원본이 기준시간을 맞춰 둔 값이라 공간끼리 비교할 수 있는 유일한 숫자다.
  //
  // ㎡ 판정보다 먼저 본다. 아래 looksPerArea 는 "요금이 1,000원 미만이면 단가일 것"
  // 이라는 어림짐작을 포함하는데, 환산액이 이미 있으면 짐작할 이유가 없다. 순서를
  // 뒤집어 두면 원본이 갱신되어 그런 행이 생겼을 때 조용히 값을 버리게 된다.
  if (venue.price4h !== null && venue.price4h > 0) {
    const unreliable = has(confidence, UNRELIABLE_CONFIDENCE);
    if (unreliable) warnings.push(`요금 근거 확인 필요(${confidence})`);

    const range =
      venue.priceMin && venue.priceMax && venue.priceMin !== venue.priceMax
        ? ` (${won(venue.priceMin)}~${won(venue.priceMax)})`
        : "";

    return {
      amount: venue.price4h,
      trust: venue.priceSource === "전화확인"
        ? "confirmed"
        : unreliable
          ? "unreliable"
          : has(confidence, CONFIRMED_CONFIDENCE)
            ? "confirmed"
            : "estimated",
      free: false,
      label: `${won(venue.price4h)} / 4시간${range}`,
      warnings,
    };
  }

  // ── ㎡당 단가 ─────────────────────────────────────────
  if (looksPerArea(venue) && venue.price !== null) {
    if (venue.areaM2 && venue.areaM2 > 0) {
      // 면적을 알면 곱해서 쓸 수 있다. 다만 이건 우리가 계산한 값이다.
      const perUse = Math.round(venue.price * venue.areaM2);
      return {
        amount: perUse,
        trust: "unreliable",
        free: false,
        label: `${won(perUse)} (${won(venue.price)}/㎡ × ${venue.areaM2.toLocaleString()}㎡)`,
        warnings: [`㎡당 요금을 면적으로 곱한 값 — 전화 확인 필요`],
      };
    }
    // 면적을 모르면 총액을 낼 방법이 없다. 13원이라고 적어 두면 거짓말이 된다.
    return {
      amount: null,
      trust: "unknown",
      free: false,
      label: `${won(venue.price)}/㎡ · 면적 미상`,
      warnings: ["㎡당 요금이라 총액을 알 수 없음 — 면적·요금 전화 확인 필요"],
    };
  }

  // ── 요금 칸으로 내려간다 ──────────────────────────────
  // 4시간 환산이 없는 행이 1,360건이다. 기준시간을 알면 우리가 환산한다.
  if (venue.price !== null && venue.price > 0) {
    const hours = venue.baseHours && venue.baseHours > 0 ? venue.baseHours : null;
    if (hours === null) {
      // 기준시간을 모르면 환산할 수 없다. 2,000원이 30분치인지 하루치인지 모른다.
      return {
        amount: null,
        trust: "unknown",
        free: false,
        label: `${won(venue.price)}${venue.priceBasis ? ` / ${venue.priceBasis}` : ""} · 기준시간 미상`,
        warnings: ["요금 기준시간을 몰라 총액 비교 불가 — 전화 확인 필요"],
      };
    }
    const blocks = Math.ceil(BASE_HOURS / hours);
    const amount = venue.price * blocks;
    warnings.push(`${venue.priceBasis ?? `${hours}시간`} 요금을 4시간으로 환산한 값`);
    return {
      amount,
      trust: has(confidence, UNRELIABLE_CONFIDENCE) ? "unreliable" : "estimated",
      free: false,
      label: `${won(amount)} / 4시간 (${won(venue.price)} × ${blocks})`,
      warnings,
    };
  }

  return {
    amount: null,
    trust: "unknown",
    free: false,
    label: "요금 미상",
    warnings: ["요금 미상 — 전화 확인 필요"],
  };
}

/**
 * 요청한 시간에 맞춘 총액.
 *
 * 4시간 기준액을 시간 비례로 늘린다. 블록 단위로 올림하지 않는 것은, 5시간 행사에
 * 8시간치를 물리면 예산 비교가 통째로 어긋나기 때문이다. 어차피 어림값이라고
 * 화면에 적어 두고, 정확한 금액은 전화로 확인한다.
 */
export function estimateForHours(resolved: ResolvedPrice, hours?: number): number | null {
  if (resolved.amount === null) return null;
  if (!hours || hours === BASE_HOURS) return resolved.amount;
  return Math.round((resolved.amount * hours) / BASE_HOURS / 1000) * 1000;
}

/** 정렬용 점수. 낮을수록 믿을 만하다. 못 믿는 요금이 앞자리를 차지하면 안 된다. */
export function trustPenalty(trust: PriceTrust): number {
  return trust === "confirmed" ? 0 : trust === "estimated" ? 0.3 : trust === "unreliable" ? 0.8 : 1;
}
