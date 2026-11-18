import { describe, expect, it } from "vitest";
import { canViewProjectContacts, parseProjectContact, projectContactToInboxItem } from "@/lib/projectContactPolicy";

describe("프로젝트 연락 상태 입력과 통합 목록", () => {
  it("일반 내부 직원은 허용하되 외부 연결·DOT·비활성 계정은 제외한다", () => {
    const user = { id: "staff", role: "member", email: "staff@example.invalid" };
    expect(canViewProjectContacts(user)).toBe(true);
    for (const denied of [{ ...user, partnerId: "outside" }, { ...user, customerId: "outside" }, { ...user, venueId: "outside" }, { ...user, role: "dot" }, { ...user, role: "pending" }, { ...user, active: false }, { ...user, isAgent: true }]) expect(canViewProjectContacts(denied)).toBe(false);
  });
  const input = { projectId: "project-one", requestId: "request-one", version: 0, status: "waiting", note: "견적 발송 후 답변 대기", nextContactAt: "" };
  it("연락 상태와 프로젝트 진행 상태를 구분하고 미정 날짜는 채우지 않는다", () => {
    expect(parseProjectContact(input)).toEqual({ ...input, nextContactAt: null });
    const item = projectContactToInboxItem({ id: "project-one", name: "행사 운영", projectStatus: "active", client: "고객사", assignee: "담당자", workScope: null, createdAt: "2026-11-01T00:00:00Z", contactStatus: "quote_sent", note: "검토 요청", nextContactAt: null, version: 1, updatedAt: "2026-11-18T00:00:00Z", history: [] });
    expect(item).toMatchObject({ key: "project:project-one", branch: "project", title: "행사 운영", status: "견적서 보냄", receivedTime: new Date("2026-11-18T00:00:00Z").getTime(), completed: false });
    expect(item.body).toContain("과업 미등록");
    expect(item.body).not.toContain("100%");
  });
  it("상태 위조·잘못된 버전·존재하지 않는 날짜와 초과 메모는 거부한다", () => {
    for (const update of [{ status: "completed" }, { version: -1 }, { version: 0.5 }, { projectId: "../other" }, { requestId: "" }, { nextContactAt: "2026-02-30T10:00" }, { note: "a".repeat(2001) }]) expect(() => parseProjectContact({ ...input, ...update })).toThrow();
    expect(() => parseProjectContact(null)).toThrow();
  });
  it("다음 연락 일정은 한국시간을 명시해서 저장한다", () => {
    expect(parseProjectContact({ ...input, nextContactAt: "2026-11-25T10:00" }).nextContactAt?.toISOString()).toBe("2026-11-25T01:00:00.000Z");
  });
});
