import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { requireMenuAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildDetailGroups } from "@/lib/venueDetail";
import { resolvePrice } from "@/lib/venuePrice";

/**
 * 공간 한 곳의 상세.
 *
 * 목록에서 이름을 눌렀을 때 쓴다. 목록 응답에 이 내용을 다 실으면 3,721건짜리
 * 검색이 무거워지므로 누를 때만 따로 가져온다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requireMenuAccess(session.user.id, "venues", session.user.role);

  const { id } = await params;
  const venue = await prisma.venue.findUnique({ where: { id } });
  if (!venue) {
    return NextResponse.json({ error: "공간을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    venue: {
      id: venue.id,
      name: venue.name,
      district: venue.district,
      address: venue.address,
      type: venue.type,

      capacityMin: venue.capacityMin,
      capacityMax: venue.capacityMax,
      seats: venue.seats,
      areaM2: venue.areaM2,

      priceBasis: venue.priceBasis,
      priceSource: venue.priceSource,
      baseHours: venue.baseHours,
      overUnit: venue.overUnit,
      overAmount: venue.overAmount,
      weekendSurcharge: venue.weekendSurcharge,
      vatType: venue.vatType,

      commercialUse: venue.commercialUse,
      saturday: venue.saturday,
      sunday: venue.sunday,
      holiday: venue.holiday,

      weekdayOpen: venue.weekdayOpen,
      weekdayClose: venue.weekdayClose,
      satOpen: venue.satOpen,
      satClose: venue.satClose,
      sunOpen: venue.sunOpen,
      sunClose: venue.sunClose,

      beam: venue.beam,
      sound: venue.sound,
      stage: venue.stage,
      lighting: venue.lighting,
      hvac: venue.hvac,
      parking: venue.parking,
      waitingRoom: venue.waitingRoom,
      electricity: venue.electricity,
      restroom: venue.restroom,
      rainPlan: venue.rainPlan,
      shadeTent: venue.shadeTent,
      cooking: venue.cooking,
      noiseLimit: venue.noiseLimit,
      rentalItems: venue.rentalItems,

      phone: venue.phone,
      reserveUrl: venue.reserveUrl,
      reserveMethod: venue.reserveMethod,
      lat: venue.lat,
      lng: venue.lng,

      // 사람이 전화로 확인해 채운 값. 원본을 다시 적재해도 덮이지 않는다.
      calledAt: venue.calledAt,
      calledPrice: venue.calledPrice,
      calledNote: venue.calledNote,
    },
    price: resolvePrice(venue),
    // raw 를 통째로 보내지 않는다. 수집 과정의 흔적까지 화면에 흘러가면 읽을 수 없다.
    groups: buildDetailGroups(venue.raw as Record<string, unknown> | null),
  });
}
