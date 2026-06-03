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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)", letterSpacing: "-0.91px" }}>
          명함 관리
        </h1>
        <CardCreateButton />
      </div>

      <BusinessCardSearch cards={cards} isAdmin={isAdmin} />
    </div>
  );
}
