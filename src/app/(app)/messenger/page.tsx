import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MessengerView } from "./MessengerView";

export default async function MessengerPage() {
  const session = await getServerSession(authOptions);

  const users = await prisma.user.findMany({
    where: { active: true, id: { not: session!.user.id }, role: { not: "pending" } },
    select: { id: true, name: true, image: true, role: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="h-full -m-4 sm:-m-6">
      <MessengerView myId={session!.user.id} users={users} />
    </div>
  );
}
