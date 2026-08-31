import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MessengerView } from "./MessengerView";

export default async function MessengerPage() {
  const session = await getServerSession(authOptions);
  const now = new Date();
  const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const users = await prisma.user.findMany({
    // isAgent 제외: AI 대화 파이프라인을 들어내서 에이전트 계정은 말을 걸어도 답하지 않는다.
    // 목록에 남겨두면 "답 없는 유령 연락처"가 된다.
    where: {
      active: true,
      isAgent: false,
      id: { not: session!.user.id },
      role: { not: "pending" },
    },
    select: { id: true, name: true, image: true, role: true, isAgent: true, agentType: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="h-full -m-4 sm:-m-6">
      <MessengerView myId={session!.user.id} users={users} todayDate={todayDate} />
    </div>
  );
}
