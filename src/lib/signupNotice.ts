/**
 * 가입 신청 알림.
 *
 * 처음 로그인한 계정은 승인 대기(pending)로 만들어지는데, 관리자가 ID 관리를 직접 열어
 * 보기 전에는 신청이 온 줄 모른다. 그래서 계정이 만들어지는 순간 관리자 전원의 메신저에
 * 한 줄을 넣는다. 보낸 사람은 신청자 본인 — 관리자 메신저에 그 사람과의 대화가 생기니
 * 누가 왔는지 이름·사진으로 바로 보이고, 승인 뒤 그 대화를 그대로 이어 쓸 수 있다.
 */

export interface SignupApplicant {
  id: string;
  name: string | null;
  email: string;
}

export function signupNoticeText(applicant: Pick<SignupApplicant, "name" | "email">, baseUrl: string): string {
  const who = applicant.name ? `${applicant.name}(${applicant.email})` : applicant.email;
  const adminUrl = `${baseUrl.replace(/\/+$/, "")}/admin`;
  return `${who}님이 가입 신청했습니다 → ID 관리 ${adminUrl}`;
}

export function appBaseUrl(): string {
  return process.env.NEXTAUTH_URL ?? "https://erp-system-lojo.onrender.com";
}

/** notifyAdminsOfSignup 이 필요로 하는 만큼만 잘라낸 DB 인터페이스 — 테스트에서 가짜로 바꾸기 위함. */
export interface SignupNoticeDb {
  user: {
    findMany(args: {
      where: { role: string; isAgent: boolean; active: boolean };
      select: { id: true };
    }): Promise<Array<{ id: string }>>;
  };
  conversation: {
    upsert(args: {
      where: { participantA_participantB: { participantA: string; participantB: string } };
      create: { participantA: string; participantB: string };
      update: { lastMessageAt: Date };
    }): Promise<{ id: string }>;
  };
  message: {
    create(args: { data: { conversationId: string; senderId: string; content: string } }): Promise<unknown>;
  };
}

/**
 * 관리자 전원에게 알림을 보낸다. 실패해도 로그인 자체는 막지 않도록 호출부에서 try/catch 한다.
 * @returns 알림을 받은 관리자 수
 */
export async function notifyAdminsOfSignup(db: SignupNoticeDb, applicant: SignupApplicant, baseUrl = appBaseUrl()): Promise<number> {
  const admins = await db.user.findMany({
    where: { role: "admin", isAgent: false, active: true },
    select: { id: true },
  });
  const content = signupNoticeText(applicant, baseUrl);
  const now = new Date();
  for (const admin of admins) {
    if (admin.id === applicant.id) continue;
    const [participantA, participantB] = [admin.id, applicant.id].sort();
    const conv = await db.conversation.upsert({
      where: { participantA_participantB: { participantA, participantB } },
      create: { participantA, participantB },
      update: { lastMessageAt: now },
    });
    await db.message.create({ data: { conversationId: conv.id, senderId: applicant.id, content } });
  }
  return admins.filter((a) => a.id !== applicant.id).length;
}
