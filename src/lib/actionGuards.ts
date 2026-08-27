import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireMenuEdit } from "@/lib/permissions";

/**
 * 서버 액션용 권한 가드.
 *
 * 액션마다 세션을 꺼내 role 을 비교하는 코드가 흩어져 있으면, 새 메뉴를 붙일 때
 * 한 군데를 빠뜨려도 아무도 모른다. 실제로 거래처·파트너 액션은 "로그인했는가"만
 * 보고 있어서 사원도 남의 거래처를 지울 수 있었다.
 */

export async function requireSessionUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session;
}

/**
 * 이 메뉴의 자료를 고칠 수 있는 사람인지 확인한다. 아니면 던진다.
 *
 * 본인 자료를 만드는 행위(출퇴근 찍기, 휴가 신청)에는 쓰지 말 것.
 * 그건 남의 기록을 손대는 것과 위험도가 달라 관리자 전용 규칙에 걸리면 안 된다.
 */
export async function requireEditAccess(menuKey: string) {
  const session = await requireSessionUser();
  await requireMenuEdit(session.user.id, menuKey, session.user.role);
  return session;
}
