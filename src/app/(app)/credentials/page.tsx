import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound } from "lucide-react";
import { CredentialTable } from "./CredentialTable";

export default async function CredentialsPage() {
  await getServerSession(authOptions);

  const credentials = await prisma.credential.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <KeyRound size={22} className="text-deep-violet" />
        <h1
          className="text-2xl font-bold text-deep-space-charcoal"
          style={{ fontFamily: "var(--font-plus-jakarta-sans)", letterSpacing: "-0.91px" }}
        >
          ID 관리
        </h1>
      </div>

      <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
            ID Database
            <span className="ml-2 text-xs font-normal text-smoke-gray">{credentials.length}개</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CredentialTable initialData={credentials} />
        </CardContent>
      </Card>
    </div>
  );
}
