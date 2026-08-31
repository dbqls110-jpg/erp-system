import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { VenueSearch } from "./VenueSearch";
import { authOptions } from "@/lib/auth";
import { requireMenuAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function VenuesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  // 권한 검사가 실패하면 JSX를 반환하지 않으므로 공간 분류를 함께 조회해도 응답에 포함되지 않는다.
  const [, districtRows, typeRows] = await Promise.all([
    requireMenuAccess(session.user.id, "venues", session.user.role),
    prisma.venue.findMany({
      where: { district: { not: null } },
      select: { district: true },
      distinct: ["district"],
      orderBy: { district: "asc" },
    }),
    prisma.venue.findMany({
      where: { type: { not: null } },
      select: { type: true },
      distinct: ["type"],
      orderBy: { type: "asc" },
    }),
  ]);

  const districts = districtRows
    .map(({ district }) => district?.trim())
    .filter((district): district is string => Boolean(district));
  const venueTypes = typeRows
    .map(({ type }) => type?.trim())
    .filter((type): type is string => Boolean(type));

  return <VenueSearch districts={districts} venueTypes={venueTypes} />;
}
