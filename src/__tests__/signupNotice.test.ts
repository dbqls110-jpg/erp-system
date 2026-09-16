/**
 * 가입 신청 → 관리자 메신저 알림
 */
import { describe, it, expect } from "vitest";
import { notifyAdminsOfSignup, signupNoticeText, type SignupNoticeDb } from "@/lib/signupNotice";

function fakeDb(adminIds: string[]) {
  const messages: Array<{ conversationId: string; senderId: string; content: string }> = [];
  const conversations: Array<{ participantA: string; participantB: string }> = [];
  const db: SignupNoticeDb = {
    user: { findMany: async () => adminIds.map((id) => ({ id })) },
    conversation: {
      upsert: async ({ create }) => {
        conversations.push(create);
        return { id: `conv-${create.participantA}-${create.participantB}` };
      },
    },
    message: {
      create: async ({ data }) => {
        messages.push(data);
        return data;
      },
    },
  };
  return { db, messages, conversations };
}

describe("signupNoticeText", () => {
  it("이름(이메일)님이 가입 신청 + ID 관리 링크", () => {
    expect(signupNoticeText({ name: "홍길동", email: "hong@x.com" }, "https://erp.example/")).toBe(
      "홍길동(hong@x.com)님이 가입 신청했습니다 → ID 관리 https://erp.example/admin",
    );
  });
  it("이름이 없으면 이메일만", () => {
    expect(signupNoticeText({ name: null, email: "hong@x.com" }, "https://erp.example")).toContain(
      "hong@x.com님이 가입 신청했습니다",
    );
  });
});

describe("notifyAdminsOfSignup", () => {
  it("관리자마다 신청자가 보낸 메시지 한 건씩", async () => {
    const { db, messages, conversations } = fakeDb(["admin-1", "admin-2"]);
    const n = await notifyAdminsOfSignup(db, { id: "new-1", name: "홍길동", email: "hong@x.com" }, "https://erp.example");
    expect(n).toBe(2);
    expect(messages).toHaveLength(2);
    expect(messages.every((m) => m.senderId === "new-1")).toBe(true);
    expect(messages[0].content).toContain("→ ID 관리 https://erp.example/admin");
    // 대화 키는 정렬된 참여자 쌍이어야 기존 대화와 합쳐진다
    expect(conversations[0]).toEqual({ participantA: "admin-1", participantB: "new-1" });
  });
  it("관리자가 없으면 아무것도 보내지 않는다", async () => {
    const { db, messages } = fakeDb([]);
    expect(await notifyAdminsOfSignup(db, { id: "new-1", name: null, email: "a@b.c" }, "x")).toBe(0);
    expect(messages).toHaveLength(0);
  });
  it("첫 계정(자기 자신이 관리자)에게는 보내지 않는다", async () => {
    const { db, messages } = fakeDb(["new-1"]);
    expect(await notifyAdminsOfSignup(db, { id: "new-1", name: null, email: "a@b.c" }, "x")).toBe(0);
    expect(messages).toHaveLength(0);
  });
});
