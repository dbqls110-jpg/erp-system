import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getAccessibleMenus } from "@/lib/permissions";
import { getCalendarViewer } from "@/lib/calendarViewer";
import { withLinkedProjectMenu } from "@/lib/projectVisibility";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) redirect("/login");
  if (session.user.active === false) redirect("/inactive");
  if (session.user.role === "pending") redirect("/pending");

  // 사이드바는 클라이언트 컴포넌트라 DB 를 직접 읽을 수 없다.
  // 접근 가능한 메뉴를 서버에서 계산해 내려준다.
  const [allowedMenus, viewer] = await Promise.all([
    getAccessibleMenus(session.user.id, session.user.role),
    getCalendarViewer(),
  ]);
  // 파트너·거래처 연결이 있는 외부 계정은 프로젝트를 읽을 수 있다.
  // 기본 메뉴 권한은 내부 직원 기준으로 유지해 다른 외부 메뉴가 열리지 않도록 한다.
  const visibleMenus = withLinkedProjectMenu(allowedMenus, viewer);

  return (
    <AppShell user={session.user} userId={session.user.id} allowedMenus={[...visibleMenus]}>
      {children}
    </AppShell>
  );
}
