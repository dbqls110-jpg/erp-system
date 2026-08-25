import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CardCreateButton } from "./CardCreateButton";
import { BusinessCardSearch } from "./BusinessCardSearch";

export default async function BusinessCardsPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === "admin";

  const cards = await prisma.businessCard.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
  });

  return (
    <div className="space-y-4">
      {/* 제목은 헤더바가 그리므로 설명 문구만 둔다 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="mt-1 text-sm text-muted-foreground">
            수집한 명함과 담당자 연락처
          </p>
        </div>
        <CardCreateButton />
      </div>

      <BusinessCardSearch cards={cards} isAdmin={isAdmin} />
    </div>
  );
}
