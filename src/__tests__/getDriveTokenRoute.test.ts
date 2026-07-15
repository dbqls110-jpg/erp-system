/**
 * GET /api/admin/get-drive-token 보안 테스트
 * - 410 Gone 반환 (엔드포인트 제거됨)
 * - 응답에 토큰 원문 없음
 * - 비관리자 포함 모든 접근 차단
 */
import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/admin/get-drive-token/route";

describe("GET /api/admin/get-drive-token (neutered)", () => {
  it("410 Gone 응답", async () => {
    const res = await GET();
    expect(res.status).toBe(410);
  });

  it("응답에 실제 토큰 값 없음 (설명 문자열은 허용)", async () => {
    const res = await GET();
    const body = await res.json();
    const raw = JSON.stringify(body);
    // "refresh_token" 단어가 에러 설명에 나오는 것은 허용
    // 실제 토큰 값 패턴 (1//로 시작하거나 긴 base64 토큰)이 없어야 함
    expect(raw).not.toMatch(/1\/\/[A-Za-z0-9_-]{20,}/);  // OAuth token prefix
    expect(raw).not.toMatch(/"token"\s*:\s*"[A-Za-z0-9._-]{40,}"/);  // actual token value
    // alternatives에 링크만 있고 토큰 값은 없어야 함
    expect(body).not.toHaveProperty("token");
    expect(body).not.toHaveProperty("refreshToken");
  });

  it("응답 body에 error 필드 있음", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("대안 엔드포인트 안내 포함", async () => {
    const res = await GET();
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("google-status");
  });
});
