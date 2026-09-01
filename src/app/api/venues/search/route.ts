import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { requireMenuAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { rankVenues, type MatchQuery, type MatchResult } from "@/lib/venueMatch";

const MAX_LIMIT = 50;
const MAX_CURSOR_IDS = 10_000;
const DAYS = ["평일", "토", "일", "공휴일"] as const;

// 순위 계산과 거리·신뢰도 계산에 실제로 필요한 열만 첫 조회에 남긴다.
const venueRankSelect = {
  id: true,
  district: true,
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
  calledAt: true,
} as const;

// 예약 URL·좌표·신청 방법은 잘라낸 한 페이지에 대해서만 채운다.
const venueDisplaySelect = {
  id: true,
  name: true,
  district: true,
  type: true,
  capacityMin: true,
  capacityMax: true,
  phone: true,
  reserveUrl: true,
  reserveMethod: true,
  lat: true,
  lng: true,
} as const;

type SearchCursor = {
  candidateIds: string[];
  blockedCount: number;
};

type SearchBody = {
  name?: unknown;
  offset?: unknown;
  people?: unknown;
  budget?: unknown;
  dayOfWeek?: unknown;
  hours?: unknown;
  district?: unknown;
  type?: unknown;
  needs?: unknown;
  commercial?: unknown;
  limit?: unknown;
  searchCursor?: unknown;
};

function positiveNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed !== "전체" ? trimmed : undefined;
}

function parseQuery(body: SearchBody) {
  const query: MatchQuery = {};
  const people = positiveNumber(body.people);
  const budget = positiveNumber(body.budget);
  const hours = positiveNumber(body.hours);

  if (people !== undefined) query.people = people;
  if (budget !== undefined) query.budget = budget;
  if (hours !== undefined) query.hours = hours;

  if (typeof body.dayOfWeek === "string" && DAYS.includes(body.dayOfWeek as (typeof DAYS)[number])) {
    query.dayOfWeek = body.dayOfWeek as MatchQuery["dayOfWeek"];
  }

  const needsValue = body.needs;
  if (needsValue && typeof needsValue === "object" && !Array.isArray(needsValue)) {
    const needsObject = needsValue as Record<string, unknown>;
    const needs = {
      parking: needsObject.parking === true,
      hvac: needsObject.hvac === true,
      beam: needsObject.beam === true,
      sound: needsObject.sound === true,
    };
    if (Object.values(needs).some(Boolean)) query.needs = needs;
  }

  if (body.commercial === true) query.commercial = true;

  const requestedLimit = positiveNumber(body.limit);
  const limit = requestedLimit === undefined
    ? 20
    : Math.min(MAX_LIMIT, Math.max(1, Math.floor(requestedLimit)));

  // offset 은 0 이 정상이라 positiveNumber 를 쓸 수 없다. 0 을 걸러 버리면 첫 장이 사라진다.
  const rawOffset = typeof body.offset === "number" ? body.offset : Number(body.offset);
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  return {
    query,
    // 이름은 "전체" 도 검색어가 될 수 있어 nonEmptyString 을 쓰지 않는다.
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined,
    district: nonEmptyString(body.district),
    type: nonEmptyString(body.type),
    limit,
    offset,
    searchCursor: parseSearchCursor(body.searchCursor),
  };
}

function parseSearchCursor(value: unknown): SearchCursor | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const cursor = value as Record<string, unknown>;
  const candidateIds = cursor.candidateIds;
  const blockedCount = cursor.blockedCount;
  if (
    !Array.isArray(candidateIds) ||
    candidateIds.length > MAX_CURSOR_IDS ||
    candidateIds.some((id) => typeof id !== "string" || id.length === 0) ||
    typeof blockedCount !== "number" ||
    !Number.isInteger(blockedCount) ||
    blockedCount < 0
  ) {
    return undefined;
  }

  return { candidateIds, blockedCount };
}

type BlockerField =
  | "commercialUse"
  | "saturday"
  | "sunday"
  | "holiday"
  | "parking"
  | "hvac";

function allowedUnlessExact(field: BlockerField, value: string): Prisma.VenueWhereInput {
  return {
    OR: [
      { [field]: null },
      { NOT: { [field]: value } },
    ],
  };
}

function allowedUnlessUnavailable(field: "parking" | "hvac"): Prisma.VenueWhereInput {
  return {
    OR: [
      { [field]: null },
      {
        AND: [
          { NOT: { [field]: "N" } },
          { NOT: { [field]: { contains: "불가" } } },
          { NOT: { [field]: { contains: "없음" } } },
        ],
      },
    ],
  };
}

function buildBlockerFilters(query: MatchQuery) {
  const blocked: Prisma.VenueWhereInput[] = [];
  const allowed: Prisma.VenueWhereInput[] = [];

  const addExactBlocker = (field: BlockerField) => {
    blocked.push({ [field]: "불가" });
    allowed.push(allowedUnlessExact(field, "불가"));
  };

  // 정원·예산은 venueMatch 의 완화 규칙을 유지해야 하므로 DB에서 제외하지 않는다.
  if (query.commercial) addExactBlocker("commercialUse");

  if (query.dayOfWeek === "토") addExactBlocker("saturday");
  if (query.dayOfWeek === "일") addExactBlocker("sunday");
  if (query.dayOfWeek === "공휴일") addExactBlocker("holiday");

  if (query.needs?.parking) {
    blocked.push({ OR: [{ parking: "N" }, { parking: { contains: "불가" } }, { parking: { contains: "없음" } }] });
    allowed.push(allowedUnlessUnavailable("parking"));
  }
  if (query.needs?.hvac) {
    blocked.push({ OR: [{ hvac: "N" }, { hvac: { contains: "불가" } }, { hvac: { contains: "없음" } }] });
    allowed.push(allowedUnlessUnavailable("hvac"));
  }

  return { blocked, allowed };
}

function compareResults(left: MatchResult, right: MatchResult) {
  return left.score - right.score || (left.estimate ?? Infinity) - (right.estimate ?? Infinity);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requireMenuAccess(session.user.id, "venues", session.user.role);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json({ error: "검색 조건 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { query, name, district, type, limit, offset, searchCursor } = parseQuery(rawBody as SearchBody);
  const baseWhere: Prisma.VenueWhereInput = {
    ...(district ? { district } : {}),
    ...(type ? { type } : {}),
    // 이름은 DB 에서 거른다. 3,721건을 전부 읽어 와서 자바스크립트로 거르면
    // 한국↔미국 왕복에 실려 오는 양만 늘어난다.
    ...(name ? { name: { contains: name, mode: "insensitive" as const } } : {}),
  };

  const { blocked: blockerWhere, allowed: allowedWhere } = buildBlockerFilters(query);
  const rankWhere: Prisma.VenueWhereInput = allowedWhere.length
    ? { AND: [baseWhere, ...allowedWhere] }
    : baseWhere;

  // 한 번에 읽는다. 나눠 읽으면 메모리는 아끼지만 왕복이 늘어 훨씬 느리다.
  // 실측: 3,721건 전체를 한 번에 1,427ms, 200건씩 19번 나눠 읽으면 3,857ms.
  // 좁은 select 라 전체를 담아도 부담이 없고, 자치구만 정해도 209ms 로 떨어진다.
  // 이제 그 한 번의 조회는 순위 열만 대상으로 하고, 화면 열은 잘라낸 뒤 보충한다.
  let bestCandidates: MatchResult[];
  let total: number;
  let blockedCount: number;
  let nextCursor: SearchCursor | undefined;

  if (offset > 0 && searchCursor) {
    const pageIds = searchCursor.candidateIds.slice(offset, offset + limit);
    const venues = pageIds.length === 0
      ? []
      : await prisma.venue.findMany({
          where: { AND: [rankWhere, { id: { in: pageIds } }] },
          select: venueRankSelect,
        });
    const ranked = rankVenues(
      venues.map((venue) => ({ ...venue, name: "", type: null, lat: null, lng: null })),
      query,
    );
    const candidatesById = new Map(ranked.candidates.map((candidate) => [candidate.venue.id, candidate]));

    // DB의 IN 조회 순서에 의존하지 않고 첫 페이지에서 확정한 순서를 그대로 쓴다.
    bestCandidates = pageIds.flatMap((id) => {
      const candidate = candidatesById.get(id);
      return candidate ? [candidate] : [];
    });
    total = searchCursor.candidateIds.length;
    blockedCount = searchCursor.blockedCount;
  } else {
    const blockedCountPromise = blockerWhere.length === 0
      ? Promise.resolve(0)
      : prisma.venue.count({ where: { AND: [baseWhere, { OR: blockerWhere }] } });
    const [venues, databaseBlockedCount] = await Promise.all([
      prisma.venue.findMany({ where: rankWhere, select: venueRankSelect }),
      blockedCountPromise,
    ]);
    const ranked = rankVenues(
      venues.map((venue) => ({ ...venue, name: "", type: null, lat: null, lng: null })),
      query,
    );
    // rankVenues 가 이미 점수순으로 정렬해 두지만, 동점 처리 기준이 여기와 달라
    // 한 번 더 정렬한 뒤 자른다.
    const orderedCandidates = ranked.candidates.sort(compareResults);
    total = orderedCandidates.length;
    blockedCount = databaseBlockedCount + ranked.blocked.length;
    bestCandidates = orderedCandidates.slice(offset, offset + limit);
    if (total > limit) {
      nextCursor = {
        candidateIds: orderedCandidates.map((candidate) => candidate.venue.id),
        blockedCount,
      };
    }
  }

  const pageIds = bestCandidates.map((candidate) => candidate.venue.id);
  const displayVenues = pageIds.length === 0
    ? []
    : await prisma.venue.findMany({ where: { id: { in: pageIds } }, select: venueDisplaySelect });
  const displayVenuesById = new Map(displayVenues.map((venue) => [venue.id, venue]));

  return NextResponse.json({
    candidates: bestCandidates.map((result) => {
      const displayVenue = displayVenuesById.get(result.venue.id);
      const venue = {
        id: displayVenue?.id ?? result.venue.id,
        name: displayVenue?.name ?? "",
        district: displayVenue ? displayVenue.district : result.venue.district,
        type: displayVenue?.type ?? null,
        capacityMin: displayVenue ? displayVenue.capacityMin : result.venue.capacityMin,
        capacityMax: displayVenue ? displayVenue.capacityMax : result.venue.capacityMax,
        phone: displayVenue ? displayVenue.phone : result.venue.phone,
        reserveUrl: displayVenue?.reserveUrl ?? null,
        reserveMethod: displayVenue?.reserveMethod ?? null,
        lat: displayVenue?.lat ?? null,
        lng: displayVenue?.lng ?? null,
      };
      return {
        venue: {
          id: venue.id,
          name: venue.name,
          district: venue.district,
          type: venue.type,
          capacityMin: venue.capacityMin,
          capacityMax: venue.capacityMax,
          phone: venue.phone,
          reserveUrl: venue.reserveUrl,
          reserveMethod: venue.reserveMethod,
          lat: venue.lat,
          lng: venue.lng,
        },
        score: result.score,
        warnings: result.warnings,
        estimate: result.estimate,
        // 금액만 보내면 화면이 "13원" 을 그대로 그린다. 어떻게 읽은 값인지 함께 보낸다.
        price: {
          label: result.price.label,
          trust: result.price.trust,
          free: result.price.free,
        },
      };
    }),
    blockedCount,
    total,
    offset,
    limit,
    ...(nextCursor ? { searchCursor: nextCursor } : {}),
  });
}
