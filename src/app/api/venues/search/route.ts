import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { requireMenuAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { rankVenues, type MatchQuery, type MatchResult } from "@/lib/venueMatch";

const MAX_LIMIT = 50;
const DAYS = ["평일", "토", "일", "공휴일"] as const;

const venueSelect = {
  id: true,
  name: true,
  district: true,
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
  };
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

  const { query, name, district, type, limit, offset } = parseQuery(rawBody as SearchBody);
  const where = {
    ...(district ? { district } : {}),
    ...(type ? { type } : {}),
    // 이름은 DB 에서 거른다. 3,721건을 전부 읽어 와서 자바스크립트로 거르면
    // 한국↔미국 왕복에 실려 오는 양만 늘어난다.
    ...(name ? { name: { contains: name, mode: "insensitive" as const } } : {}),
  };

  // 한 번에 읽는다. 나눠 읽으면 메모리는 아끼지만 왕복이 늘어 훨씬 느리다.
  // 실측: 3,721건 전체를 한 번에 1,427ms, 200건씩 19번 나눠 읽으면 3,857ms.
  // 좁은 select 라 전체를 담아도 부담이 없고, 자치구만 정해도 209ms 로 떨어진다.
  const venues = await prisma.venue.findMany({ where, select: venueSelect });

  const ranked = rankVenues(venues, query);
  const total = ranked.candidates.length;
  const blockedCount = ranked.blocked.length;
  // rankVenues 가 이미 점수순으로 정렬해 두지만, 동점 처리 기준이 여기와 달라
  // 한 번 더 정렬한 뒤 자른다.
  const bestCandidates: MatchResult[] = ranked.candidates
    .sort(compareResults)
    .slice(offset, offset + limit);

  return NextResponse.json({
    candidates: bestCandidates.map((result) => {
      const venue = result.venue as typeof result.venue & {
        reserveUrl: string | null;
        reserveMethod: string | null;
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
  });
}
