/**
 * 가입 신청 → 관리자 ERP 비서 알림
 */
import { describe, it, expect } from "vitest";
import { notifyAdminsOfSignup, signupNoticeText, type SignupNoticeDb } from "@/lib/signupNotice";

function fakeDb(adminIds: string[]) {
  const jobs: Array<Record<string, unknown>> = [];
  const db: SignupNoticeDb = {
    user: { findMany: async () => adminIds.map((id) => ({ id })) },
    agentJob: {
      create: async ({ data }) => {
        jobs.push(data);
        return data;
      },
    },
  };
  return { db, jobs };
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
  it("관리자마다 비서의 완료된 답변 한 건씩 — 질문은 비우고 브릿지가 집어가지 않게 completed", async () => {
    const { db, jobs } = fakeDb(["admin-1", "admin-2"]);
    const n = await notifyAdminsOfSignup(db, { id: "new-1", name: "홍길동", email: "hong@x.com" }, "https://erp.example");
    expect(n).toBe(2);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.userId)).toEqual(["admin-1", "admin-2"]);
    for (const job of jobs) {
      expect(job.status).toBe("completed");
      expect(job.visibility).toBe("user");
      expect(job.userInput).toBe("");
      expect(job.output).toContain("→ ID 관리 https://erp.example/admin");
    }
  });
  it("관리자가 없으면 아무것도 보내지 않는다", async () => {
    const { db, jobs } = fakeDb([]);
    expect(await notifyAdminsOfSignup(db, { id: "new-1", name: null, email: "a@b.c" }, "x")).toBe(0);
    expect(jobs).toHaveLength(0);
  });
  it("첫 계정(자기 자신이 관리자)에게는 보내지 않는다", async () => {
    const { db, jobs } = fakeDb(["new-1"]);
    expect(await notifyAdminsOfSignup(db, { id: "new-1", name: null, email: "a@b.c" }, "x")).toBe(0);
    expect(jobs).toHaveLength(0);
  });
});
