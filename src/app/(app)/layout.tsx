import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getAccessibleMenus } from "@/lib/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) redirect("/login");
  if (session.user.role === "pending") redirect("/pending");

  // 사이드바는 클라이언트 컴포넌트라 DB 를 직접 읽을 수 없다.
  // 접근 가능한 메뉴를 서버에서 계산해 내려준다.
  const allowedMenus = await getAccessibleMenus(session.user.id, session.user.role);

  return (
    <AppShell user={session.user} userId={session.user.id} allowedMenus={[...allowedMenus]}>
      {children}
    </AppShell>
  );
}
