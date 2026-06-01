import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "./SignOutButton";

export default async function PendingPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "pending") redirect("/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center bg-hint-of-sky">
      <Card className="w-full max-w-sm shadow-[var(--shadow-subtle)] border-ash-gray" style={{ borderRadius: "12px" }}>
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-warm-fade/10 flex items-center justify-center text-xl">⏳</div>
          <CardTitle className="text-xl font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
            승인 대기 중
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-smoke-gray leading-relaxed">
            <strong className="text-midnight-charcoal">{session.user.name ?? session.user.email}</strong>님,
            <br />관리자가 계정을 승인하면 이용 가능합니다.
          </p>
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}
