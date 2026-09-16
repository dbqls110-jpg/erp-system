/**
 * 가입 신청 알림.
 *
 * 처음 로그인한 계정은 승인 대기(pending)로 만들어지는데, 관리자가 ID 관리를 직접 열어
 * 보기 전에는 신청이 온 줄 모른다. 그래서 계정이 만들어지는 순간 관리자 전원의
 * "ERP 비서" 대화에 알림 한 줄을 넣는다.
 *
 * 처음엔 신청자 명의의 메신저 DM 으로 보냈는데, 아직 승인도 안 된 사람이 관리자에게
 * 말을 건 모양이 되어 어색했다. 비서의 완료된 답변(agentJob) 으로 넣으면 질문 없이
 * 비서가 먼저 알려 준 형태가 된다. 브릿지는 pending 인 job 만 집어가므로 건드리지 않는다.
 */

export interface SignupApplicant {
  id: string;
  name: string | null;
  email: string;
}

/** 비서 알림임을 나타내는 프롬프트 표식. 화면은 userInput 이 비어 있으면 질문 말풍선을 그리지 않는다. */
export const ASSISTANT_NOTICE_INPUT = "[알림]";
export const ASSISTANT_AGENT_TYPE = "agent-1";

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
  agentJob: {
    create(args: {
      data: {
        agentType: string;
        userId: string;
        visibility: string;
        status: string;
        input: string;
        userInput: string;
        output: string;
        completedAt: Date;
      };
    }): Promise<unknown>;
  };
}

/**
 * 관리자 전원의 비서 대화에 알림을 넣는다. 실패해도 로그인 자체는 막지 않도록 호출부에서 try/catch 한다.
 * @returns 알림을 받은 관리자 수
 */
export async function notifyAdminsOfSignup(db: SignupNoticeDb, applicant: SignupApplicant, baseUrl = appBaseUrl()): Promise<number> {
  const admins = await db.user.findMany({
    where: { role: "admin", isAgent: false, active: true },
    select: { id: true },
  });
  const content = signupNoticeText(applicant, baseUrl);
  const now = new Date();
  const targets = admins.filter((a) => a.id !== applicant.id);
  for (const admin of targets) {
    await db.agentJob.create({
      data: {
        agentType: ASSISTANT_AGENT_TYPE,
        userId: admin.id,
        visibility: "user",
        status: "completed",
        input: ASSISTANT_NOTICE_INPUT,
        userInput: "",
        output: content,
        completedAt: now,
      },
    });
  }
  return targets.length;
}
