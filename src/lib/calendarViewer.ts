import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import type { Viewer } from "@/lib/calendarVisibility";

/**
 * 세션에서 캘린더 판정에 필요한 값만 뽑는다.
 *
 * 조회 지점마다 session.user 에서 직접 꺼내 쓰면, 새 화면을 붙일 때 partnerId 를
 * 빠뜨려도 아무 경고 없이 전부 보이게 된다. 한 곳을 거치게 해 둔다.
 */
export async function getCalendarViewer(): Promise<Viewer | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    role: session.user.role,
    partnerId: session.user.partnerId,
    customerId: session.user.customerId,
  };
}
