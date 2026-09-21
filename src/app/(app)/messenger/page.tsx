import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireMenuAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { messengerContactWhere } from "@/lib/messengerContacts";
import { MessengerView } from "./MessengerView";

export default async function MessengerPage() {
  const session = await getServerSession(authOptions);
  await requireMenuAccess(session!.user.id, "messenger", session!.user.role);
  const now = new Date();
  const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // 외부인은 담당 직원만 보인다. 목록 API(/api/messenger/users)와 같은 규칙.
  // isAgent 제외: 에이전트 계정은 말을 걸어도 답하지 않는다 — 목록에 남기면 "답 없는 유령 연락처"가 된다.
  const me = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { id: true, role: true, partnerId: true, customerId: true, venueId: true, staffUserId: true, active: true, isAgent: true },
  });
  const users = await prisma.user.findMany({
    where: me ? messengerContactWhere(me) : { id: "__none__" },
    select: { id: true, name: true, image: true, role: true, isAgent: true, agentType: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="h-full -m-4 sm:-m-6">
      <MessengerView
        myId={session!.user.id}
        myUser={{
          id: session!.user.id,
          name: session!.user.name ?? null,
          image: session!.user.image ?? null,
        }}
        users={users}
        todayDate={todayDate}
      />
    </div>
  );
}
