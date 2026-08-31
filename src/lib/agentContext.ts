import { prisma } from "@/lib/prisma";
import { rankVenues, type VenueLike } from "@/lib/venueMatch";
import { extractVenueQuery, type ExtractedVenueQuery, type VenueSpacePreference } from "@/lib/venueQuery";

export { extractVenueQuery, extractVenueMatchQuery } from "@/lib/venueQuery";

/**
 * 에이전트 질문에 필요한 ERP 데이터를 붙여준다.
 *
 * 예전 구조는 AI 가 텍스트 검색으로 답을 추측하게 두었고, 그래서 잘린 데이터를 보고도
 * 확신에 차서 틀린 답을 냈다. 여기서는 서버가 먼저 DB 를 조회해 사실을 넘겨준다.
 *
 * 요청자는 항상 서버가 아는 값(AgentJob.userId)에서 오며, 질문 본문에서 뽑지 않는다.
 */

export type ContextTopic = "venues" | "customers" | "partners" | "projects";

const TOPIC_PATTERNS: Record<ContextTopic, RegExp> = {
  venues: /공간|장소|대관|행사장|체육관|공연장|강당|회의실|세미나|컨벤션|부스|바자회|운동회|잔디|야외|실내/,
  customers: /거래처|고객사|협력사|공급사/,
  partners: /파트너|협력업체|계약/,
  projects: /프로젝트|과업|진행\s*중인\s*일/,
};

export function detectTopics(question: string): ContextTopic[] {
  return (Object.keys(TOPIC_PATTERNS) as ContextTopic[]).filter((t) =>
    TOPIC_PATTERNS[t].test(question),
  );
}

export interface AgentContext {
  topics: ContextTopic[];
  data: Record<string, unknown>;
  /** 지도에 찍을 좌표. 좌표가 없는 항목은 포함하지 않는다. */
  pins: { id: string; name: string; lat: number; lng: number; note?: string }[];
}

const VENUE_SELECT = {
  id: true,
  name: true,
  district: true,
  address: true,
  type: true,
  capacityMin: true,
  capacityMax: true,
  price: true,
  priceBasis: true,
  priceSource: true,
  baseHours: true,
  price4h: true,
  priceConfidence: true,
  priceMin: true,
  priceMax: true,
  areaM2: true,
  commercialUse: true,
  saturday: true,
  sunday: true,
  holiday: true,
  hvac: true,
  parking: true,
  beam: true,
  sound: true,
  phone: true,
  reserveUrl: true,
  reserveMethod: true,
  lat: true,
  lng: true,
  calledAt: true,
} as const;

type VenueContextRow = VenueLike & {
  address: string | null;
  reserveUrl: string | null;
  reserveMethod: string | null;
};

const OUTDOOR_WORDS = /야외|잔디|운동장|주경기장|보조경기장|경기장|축구장|야구장|구장|공원|광장|노천|옥외|마당|필드/;
const INDOOR_WORDS = /실내|체육관|다목적실|강당|회의실|컨벤션|공연장|전시장|홀/;

function venueSpaceKind(venue: Pick<VenueContextRow, "name" | "type" | "address">) {
  const text = [venue.name, venue.type, venue.address].filter(Boolean).join(" ");
  if (OUTDOOR_WORDS.test(text)) return "outdoor" as const;
  if (INDOOR_WORDS.test(text)) return "indoor" as const;
  return "unknown" as const;
}

function capacityValue(venue: Pick<VenueLike, "capacityMin" | "capacityMax">) {
  return venue.capacityMax ?? venue.capacityMin;
}

function capacityLabel(venue: Pick<VenueLike, "capacityMin" | "capacityMax">) {
  const { capacityMin: min, capacityMax: max } = venue;
  if (min === null && max === null) return null;
  if (min !== null && max !== null && min !== max) {
    return `${min.toLocaleString()}~${max.toLocaleString()}명`;
  }
  return `${(max ?? min)!.toLocaleString()}명`;
}

function uniqueWarnings(warnings: string[]) {
  return [...new Set(warnings)];
}

function preferredSpaceKind(preference: VenueSpacePreference) {
  return preference === "outdoor-first" ? "outdoor" : "indoor";
}

function orderVenueCandidates(
  candidates: ReturnType<typeof rankVenues>["candidates"],
  preference: VenueSpacePreference | null,
) {
  const sorted = [...candidates].sort(
    (left, right) => left.score - right.score || (left.estimate ?? Infinity) - (right.estimate ?? Infinity),
  );
  if (!preference) return sorted.slice(0, 25);

  const preferredKind = preferredSpaceKind(preference);
  const preferred = sorted.filter((result) => venueSpaceKind(result.venue as VenueContextRow) === preferredKind);
  const fallback = sorted.filter((result) => venueSpaceKind(result.venue as VenueContextRow) !== preferredKind);
  return [...preferred.slice(0, 20), ...fallback, ...preferred.slice(20)].slice(0, 25);
}

function interpretedQuery(query: ExtractedVenueQuery) {
  return {
    people: query.people ?? null,
    budget: query.budget ?? null,
    hours: query.hours ?? null,
    dayOfWeek: query.dayOfWeek ?? null,
    district: query.district ?? null,
    needs: query.needs ?? null,
    commercial: query.commercial ?? null,
    locationDistricts: query.locationDistricts,
    spacePreference: query.spacePreference,
  };
}

function venueNote(extra: string[] = []) {
  return [
    "요금은 DB의 4시간 기준 환산값이며, 일부는 근거가 불확실합니다.",
    "문의한 날짜별 예약 가능 여부는 우리 DB에 없으므로 각 공간에 전화로 확인해야 합니다.",
    ...extra,
  ].join(" ");
}

export async function buildAgentContext(question: string): Promise<AgentContext> {
  const topics = detectTopics(question);
  const data: Record<string, unknown> = {};
  const pins: AgentContext["pins"] = [];

  await Promise.all(
    topics.map(async (topic) => {
      switch (topic) {
        case "customers": {
          const rows = await prisma.customer.findMany({
            select: { id: true, name: true, manager: true, phone: true, category: true, status: true },
            orderBy: { updatedAt: "desc" },
            take: 200,
          });
          data.customers = { count: rows.length, items: rows };
          break;
        }
        case "partners": {
          const rows = await prisma.partner.findMany({
            select: {
              id: true, name: true, job: true, phone: true,
              contractStatus: true, contractStart: true, contractEnd: true, settlementType: true,
            },
            orderBy: { updatedAt: "desc" },
            take: 200,
          });
          data.partners = { count: rows.length, items: rows };
          break;
        }
        case "projects": {
          const rows = await prisma.project.findMany({
            where: { status: "active" },
            select: {
              id: true, name: true, client: true, company: true, deadline: true,
              progress: true, assignee: true, revenue: true, cost: true,
            },
            orderBy: { updatedAt: "desc" },
            take: 100,
          });
          data.projects = { count: rows.length, items: rows };
          break;
        }
        case "venues": {
          const query = extractVenueQuery(question);
          const rows = await prisma.venue.findMany({
            ...(query.locationDistricts
              ? { where: { district: { in: query.locationDistricts } } }
              : {}),
            select: VENUE_SELECT,
          });
          let venueRows = rows as VenueContextRow[];
          const extraNotes: string[] = [];

          // 지역 표기가 데이터와 다르면 전체를 다시 읽어 자료가 비는 일을 막는다.
          if (venueRows.length === 0 && query.locationDistricts) {
            venueRows = (await prisma.venue.findMany({ select: VENUE_SELECT })) as VenueContextRow[];
            extraNotes.push("해석한 지역 표기와 일치하는 행이 없어 전체 공간에서 후보를 찾았습니다.");
          }

          // 인원 조건이 있으면 실제로 수용 가능한 규모를 먼저 세어 총계를 읽기 쉽게 만든다.
          const capacityMatched = query.people === undefined
            ? venueRows
            : venueRows.filter((venue) => {
                const capacity = capacityValue(venue);
                return capacity !== null && capacity >= query.people!;
              });
          const sourceVenues = query.people !== undefined && capacityMatched.length > 0
            ? capacityMatched
            : venueRows;
          if (query.people !== undefined && capacityMatched.length === 0 && venueRows.length > 0) {
            extraNotes.push("요청 인원 이상으로 표기된 공간이 없어 전체 공간에서 규모순 후보를 골랐습니다.");
          }

          let ranked = rankVenues(sourceVenues, query);
          let candidates = ranked.candidates;
          if (candidates.length === 0 && sourceVenues.length > 0) {
            // 조건을 너무 엄격하게 해석해도 AI에 빈 자료를 보내지 않고 확인용 후보를 남긴다.
            ranked = rankVenues(sourceVenues, { ...query, budget: undefined, dayOfWeek: undefined, commercial: undefined });
            candidates = ranked.candidates;
            extraNotes.push("입력 조건을 모두 만족하는 후보가 없어 일부 조건을 풀고 순위를 계산했습니다.");
          }

          const shown = orderVenueCandidates(candidates, query.spacePreference);
          const items = shown.map((result) => {
            const venue = result.venue as VenueContextRow;
            const kind = venueSpaceKind(venue);
            const spaceWarnings = query.spacePreference && kind === "unknown"
              ? ["야외·실내 구분이 DB에 없어 전화 확인 필요"]
              : [];
            const warnings = uniqueWarnings([...result.warnings, ...spaceWarnings]);
            if (venue.lat !== null && venue.lng !== null && Number.isFinite(venue.lat) && Number.isFinite(venue.lng)) {
              pins.push({
                id: venue.id,
                name: venue.name,
                lat: venue.lat,
                lng: venue.lng,
                note: [venue.district, venue.type].filter(Boolean).join(" · ") || undefined,
              });
            }
            return {
              id: venue.id,
              name: venue.name,
              district: venue.district,
              address: venue.address,
              type: venue.type,
              capacity: {
                min: venue.capacityMin,
                max: venue.capacityMax,
                label: capacityLabel(venue),
              },
              price: {
                label: result.price.label,
                trust: result.price.trust,
                free: result.price.free,
              },
              estimate: result.estimate,
              phone: venue.phone,
              reserveMethod: venue.reserveMethod,
              reserveUrl: venue.reserveUrl,
              space: kind,
              warnings,
            };
          });

          data.venues = {
            total: sourceVenues.length,
            eligible: candidates.length,
            blocked: ranked.blocked.length,
            shown: items.length,
            query: interpretedQuery(query),
            note: venueNote(extraNotes),
            items,
          };
          break;
        }
      }
    }),
  );

  return { topics, data, pins };
}
