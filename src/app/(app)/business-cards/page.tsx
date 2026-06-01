import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { CardCreateButton } from "./CardCreateButton";
import { CardDeleteButton } from "./CardDeleteButton";
import { Phone, Mail, MapPin, Building, Briefcase } from "lucide-react";

export default async function BusinessCardsPage() {
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

      {cards.length === 0 ? (
        <Card className="border-ash-gray">
          <CardContent className="py-12 text-center text-smoke-gray text-sm">
            등록된 명함이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map((c) => (
            <Card key={c.id} className="border-ash-gray shadow-[var(--shadow-sm)]">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1 min-w-0">
                    <p className="font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
                      {c.name}
                    </p>
                    {c.jobTitle && (
                      <p className="text-sm text-smoke-gray flex items-center gap-1">
                        <Briefcase size={12} /> {c.jobTitle}
                      </p>
                    )}
                    {c.company && (
                      <p className="text-sm text-midnight-charcoal flex items-center gap-1">
                        <Building size={12} /> {c.company}
                      </p>
                    )}
                    {c.phone && (
                      <p className="text-sm text-smoke-gray flex items-center gap-1">
                        <Phone size={12} /> {c.phone}
                      </p>
                    )}
                    {c.email && (
                      <p className="text-sm text-smoke-gray flex items-center gap-1 truncate">
                        <Mail size={12} /> {c.email}
                      </p>
                    )}
                    {c.address && (
                      <p className="text-xs text-smoke-gray flex items-center gap-1">
                        <MapPin size={11} /> {c.address}
                      </p>
                    )}
                  </div>
                  <CardDeleteButton id={c.id} />
                </div>
                <p className="text-xs text-smoke-gray mt-2 border-t border-ash-gray pt-2">
                  등록자: {c.user.name} · {c.createdAt.toLocaleDateString("ko-KR")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
