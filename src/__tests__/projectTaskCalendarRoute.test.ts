import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ session: vi.fn(), viewer: vi.fn(), access: vi.fn(), projects: vi.fn(), tasks: vi.fn(), events: vi.fn(), leaves: vi.fn(), notion: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({ canAccessMenu: m.access }));
vi.mock("@/lib/calendarViewer", () => ({ getCalendarViewer: m.viewer }));
vi.mock("@/lib/notion", () => ({ getNotionEvents: m.notion }));
vi.mock("@/lib/prisma", () => ({ prisma: { project: { findMany: m.projects }, checklistItem: { findMany: m.tasks }, calendarEvent: { findMany: m.events }, leaveRequest: { findMany: m.leaves } } }));
import { GET } from "@/app/api/calendar/route";

const staff = { id: "staff", role: "member", active: true, partnerId: null, customerId: null, venueId: null };
const request = (query = "year=2026&month=11") => new NextRequest(`https://erp.example.invalid/api/calendar?${query}`);
beforeEach(() => {
  vi.resetAllMocks(); m.session.mockResolvedValue({ user: staff }); m.viewer.mockResolvedValue(staff); m.access.mockResolvedValue(true);
  for (const mock of [m.projects, m.tasks, m.events, m.leaves, m.notion]) mock.mockResolvedValue([]);
});
describe("캘린더의 프로젝트 업무 조회", () => {
  it("미로그인·비활성·메뉴 권한 없음은 조회 전에 거부한다", async () => {
    m.session.mockResolvedValue(null); expect((await GET(request())).status).toBe(401);
    m.session.mockResolvedValue({ user: { ...staff, active: false } }); expect((await GET(request())).status).toBe(401);
    m.session.mockResolvedValue({ user: staff }); m.access.mockResolvedValue(false); expect((await GET(request())).status).toBe(403);
    expect(m.projects).not.toHaveBeenCalled(); expect(m.tasks).not.toHaveBeenCalled();
  });
  it.each(["year=NaN&month=11", "year=2026&month=13", "year=2026&month=0", "year=2026.5&month=1"])("잘못된 월을 DB 조회 전에 거부한다: %s", async query => {
    expect((await GET(request(query))).status).toBe(400); expect(m.tasks).not.toHaveBeenCalled();
  });
  it("연결 프로젝트가 있어도 외부 계정에는 내부 업무·일정을 주지 않는다", async () => {
    const outsider = { ...staff, role: "admin", partnerId: "partner" };
    m.session.mockResolvedValue({ user: outsider }); m.viewer.mockResolvedValue(outsider);
    m.projects.mockResolvedValue([{ id: "public-project", name: "공개 프로젝트", deadline: "2026-11-17", announceDate: null }]);
    const data = await (await GET(request())).json();
    expect(data).toHaveLength(1); expect(data[0].type).toBe("deadline");
    expect(m.tasks).not.toHaveBeenCalled(); expect(m.events).not.toHaveBeenCalled(); expect(m.notion).not.toHaveBeenCalled(); expect(m.leaves).not.toHaveBeenCalled();
  });
  it("프로젝트 열람 권한이 없으면 내부 계정도 업무 제목을 못 본다", async () => {
    m.access.mockImplementation((_id, menu) => Promise.resolve(menu === "calendar"));
    expect(await (await GET(request())).json()).toEqual([]); expect(m.tasks).not.toHaveBeenCalled();
  });
  it("API도 같은 원본의 확인·마감을 날짜별 한 건으로 반환한다", async () => {
    m.tasks.mockResolvedValue([{ id: "task", projectId: "project", content: "원본 업무", isDone: false, completedAt: null, order: 0, assigneeId: "staff", assignee: { name: "직원" }, taskStatus: "todo", nextCheckDate: "2026-11-17", dueDate: "2026-11-17", waitingOn: null, version: 0, project: { name: "테스트 프로젝트" } }]);
    const data = await (await GET(request())).json();
    expect(data).toHaveLength(1); expect(data[0]).toMatchObject({ id: "task:task:both", date: "2026-11-17", taskId: "task", type: "task" });
    expect(JSON.stringify(m.tasks.mock.calls[0][0].where)).toContain("2026-11-30");
  });
});
