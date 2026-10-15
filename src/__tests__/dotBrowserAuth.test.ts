import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOT_ACCOUNT_ID } from "@/lib/dotPolicy";

const session = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: session.get }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { authorizeDotRequest, getDotBrowserSession } from "@/lib/dotRequestAuth";

const browserSession = { user: { id: DOT_ACCOUNT_ID, role: "dot", active: true } };
function request(method = "GET", headers: Record<string, string> = {}) {
  return new Request("https://erp.test/api/agent/dot/reports", { method, headers });
}
beforeEach(() => {
  vi.clearAllMocks();
  session.get.mockResolvedValue(browserSession);
  vi.stubEnv("NEXTAUTH_URL", "https://erp.test");
  vi.stubEnv("DOT_INTEGRATION_SECRET", "test-only-browser-dot-credential-32-characters");
});
afterEach(() => vi.unstubAllEnvs());

describe("DOT 브라우저 인증", () => {
  it("쿠키 없는 익명 요청은 세션·DB를 조회하지 않는다", async () => {
    expect(await authorizeDotRequest(request())).toBe(false);
    expect(session.get).not.toHaveBeenCalled();
  });
  it("일반 관리자 세션은 보고 권한을 받지 않는다", async () => {
    session.get.mockResolvedValue({ user: { id: "owner", role: "admin", active: true } });
    expect(await authorizeDotRequest(request("GET", { cookie: "session=opaque" }))).toBe(false);
  });
  it("역할뿐 아니라 고정 DOT ID·활성 상태를 모두 검사한다", async () => {
    for (const user of [{ id: "other", role: "dot", active: true }, { id: DOT_ACCOUNT_ID, role: "admin", active: true }, { id: DOT_ACCOUNT_ID, role: "dot", active: false }]) {
      session.get.mockResolvedValue({ user });
      expect(await getDotBrowserSession()).toBeNull();
    }
  });
  it("유효한 DOT 세션만 자료를 읽는다", async () => {
    expect(await authorizeDotRequest(request("GET", { cookie: "session=opaque" }))).toBe(true);
  });
  it("Origin이 없거나 외부이면 보고 요청은 세션 조회 전 거부한다", async () => {
    for (const origin of [undefined, "https://other.test", "null"]) {
      expect(await authorizeDotRequest(request("POST", { cookie: "session=opaque", ...(origin ? { origin } : {}) }))).toBe(false);
    }
    expect(session.get).not.toHaveBeenCalled();
  });
  it("same-site나 cross-site 표기도 거부한다", async () => {
    expect(await authorizeDotRequest(request("POST", { cookie: "session=opaque", origin: "https://erp.test", "sec-fetch-site": "same-site" }))).toBe(false);
    expect(session.get).not.toHaveBeenCalled();
  });
  it("같은 사이트의 유효 DOT 세션으로만 보고할 수 있다", async () => {
    expect(await authorizeDotRequest(request("POST", { cookie: "session=opaque", origin: "https://erp.test", "sec-fetch-site": "same-origin" }))).toBe(true);
  });
  it("잘못된 Bearer는 브라우저 세션으로 우회하지 않는다", async () => {
    expect(await authorizeDotRequest(request("GET", { authorization: "Bearer wrong", cookie: "session=opaque" }))).toBe(false);
    expect(session.get).not.toHaveBeenCalled();
  });
  it("전용 Bearer의 기존 서버 간 계약은 유지한다", async () => {
    expect(await authorizeDotRequest(request("POST", { authorization: "Bearer test-only-browser-dot-credential-32-characters" }))).toBe(true);
    expect(session.get).not.toHaveBeenCalled();
  });
  it("운영 Origin 미설정은 닫힌 상태로 유지한다", async () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    expect(await authorizeDotRequest(request("POST", { cookie: "session=opaque", origin: "https://erp.test" }))).toBe(false);
    expect(session.get).not.toHaveBeenCalled();
  });
});
