/**
 * 라우트 인증 순서 검증
 *
 * 배경: 일부 에이전트 라우트가 대상 레코드의 agentType 을 알아야 키를 검증할 수 있어서
 * DB 조회를 먼저 했다. 그러면 자격증명 없는 요청이 DB 쿼리를 유발한다. 이 프로젝트는
 * 무료 플랜 컴퓨트 소진으로 이미 DB 를 한 번 갈아엎었으므로(Neon -> Supabase),
 * 인증 없이 DB 를 건드릴 수 있는 경로를 만들지 않는다.
 *
 * 규칙: 라우트 핸들러에서 첫 prisma 접근보다 인증 검사가 먼저 나와야 한다.
 * agentType 별 정밀 검증이 조회 뒤에 필요하면, 조회 앞에 hasAnyBridgeCredential 로
 * 사전 검사를 두면 된다.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const API_DIR = path.join(ROOT, "src/app/api");

const AUTH_CALL = /\b(hasAnyBridgeCredential|verifyBridgeApiKey|verifyAgentApiKey|getServerSession|requireAdmin)\s*\(/;
const PRISMA_CALL = /\bprisma\s*\.\s*[a-zA-Z$]/;
const FIRST_HANDLER = /export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE)\b/;

// 인증 없이 DB 를 읽는 것이 의도된 라우트. 추가하려면 반드시 이유를 적을 것.
const ALLOWED = new Map<string, string>([
  // 로그인 자체를 처리하므로 세션이 있을 수 없음
  ["src/app/api/auth/[...nextauth]/route.ts", "NextAuth 핸들러"],
]);

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(full, out);
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

describe("라우트는 DB 접근 전에 인증한다", () => {
  it("첫 prisma 호출보다 인증 검사가 먼저 나온다", () => {
    const offenders: string[] = [];

    for (const file of routeFiles(API_DIR)) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      if (ALLOWED.has(rel)) continue;

      const src = fs.readFileSync(file, "utf8");
      // import 구문과 상단 상수를 제외하고 핸들러 본문부터 본다
      const start = src.search(FIRST_HANDLER);
      if (start === -1) continue;
      const body = src.slice(start);

      const prismaAt = body.search(PRISMA_CALL);
      if (prismaAt === -1) continue;

      const authAt = body.search(AUTH_CALL);
      if (authAt === -1 || authAt > prismaAt) offenders.push(rel);
    }

    expect(
      offenders,
      `라우트 핸들러가 인증 전에 DB 를 조회합니다. 조회 앞에 인증 검사를 두세요. ` +
        `agentType 을 알아야 키를 검증할 수 있으면 hasAnyBridgeCredential(req) 로 먼저 거르고, ` +
        `레코드를 읽은 뒤 verifyBridgeApiKey(req, record.agentType) 로 다시 확인하면 됩니다. ` +
        `해당 파일: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
