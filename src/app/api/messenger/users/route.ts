import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/**
 * 메신저에서 말을 걸 수 있는 직원 목록.
 *
 * 메신저 페이지는 서버 컴포넌트라 직접 조회하면 되지만, 플로팅 위젯은 어느
 * 페이지에서나 뜨는 클라이언트 컴포넌트라 서버에서 props 를 내려줄 자리가 없다.
 * 그래서 위젯을 처음 열 때 한 번만 가져가도록 별도 라우트로 뺐다.
 *
 * 필터는 메신저 페이지와 같아야 한다. 다르면 같은 대화 상대가 한쪽에만 보인다.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json([], { status: 401 });

  const users = await prisma.user.findMany({
    where: {
      active: true,
      isAgent: false,
      id: { not: session.user.id },
      role: { not: "pending" },
    },
    select: { id: true, name: true, image: true, role: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}
