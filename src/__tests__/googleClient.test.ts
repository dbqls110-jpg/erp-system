/**
 * googleClient 테스트
 * - isInvalidGrantError: 다양한 에러 형태 감지
 * - isTransientError: 5xx/네트워크만 재시도 허용, 4xx 거부
 * - encryptForStorage / decryptFromStorage: 암복호화 왕복
 * - getEncKey 유효성 검사: 키 없음 / 너무 짧음 → 즉시 오류
 * - clearDriveTokenCache: 캐시 초기화
 * - getDriveRefreshToken: env var 있으면 DB 조회 없이 반환
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isInvalidGrantError,
  isTransientError,
  encryptForStorage,
  decryptFromStorage,
  clearDriveTokenCache,
  getDriveRefreshToken,
} from "@/lib/googleClient";

// ─── isInvalidGrantError ──────────────────────────────────────────────────────

describe("isInvalidGrantError", () => {
  it("response.data.error === 'invalid_grant'", () => {
    expect(isInvalidGrantError({ response: { data: { error: "invalid_grant" } } })).toBe(true);
  });

  it("message에 invalid_grant 포함", () => {
    expect(isInvalidGrantError({ message: "invalid_grant token expired" })).toBe(true);
  });

  it("errors 배열의 reason에 invalid_grant", () => {
    expect(
      isInvalidGrantError({ errors: [{ reason: "invalid_grant" }] })
    ).toBe(true);
  });

  it("대소문자 무시: 대문자 INVALID_GRANT도 감지 (toLowerCase 사용)", () => {
    // 구현이 toLowerCase()를 사용하므로 대문자도 감지됨
    expect(isInvalidGrantError({ message: "Token has been INVALID_GRANT" })).toBe(true);
    expect(isInvalidGrantError({ message: "invalid_grant" })).toBe(true);
  });

  it("일반 401 에러는 false", () => {
    expect(isInvalidGrantError({ response: { status: 401, data: { error: "unauthorized" } } })).toBe(false);
  });

  it("null/undefined는 false", () => {
    expect(isInvalidGrantError(null)).toBe(false);
    expect(isInvalidGrantError(undefined)).toBe(false);
    expect(isInvalidGrantError("string")).toBe(false);
  });
});

// ─── isTransientError ────────────────────────────────────────────────────────

describe("isTransientError", () => {
  it("5xx 응답은 재시도 허용", () => {
    expect(isTransientError({ response: { status: 500 } })).toBe(true);
    expect(isTransientError({ response: { status: 503 } })).toBe(true);
  });

  it("4xx 응답은 재시도 불가 (invalid_grant 포함)", () => {
    expect(isTransientError({ response: { status: 400 } })).toBe(false);
    expect(isTransientError({ response: { status: 401 } })).toBe(false);
    expect(isTransientError({ response: { status: 403 } })).toBe(false);
  });

  it("네트워크 에러는 재시도 허용", () => {
    expect(isTransientError({ message: "ECONNRESET" })).toBe(true);
    expect(isTransientError({ message: "connect ETIMEDOUT" })).toBe(true);
    expect(isTransientError({ message: "getaddrinfo ENOTFOUND" })).toBe(true);
  });

  it("null/undefined는 false", () => {
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});

// ─── 암복호화 ─────────────────────────────────────────────────────────────────

describe("encryptForStorage / decryptFromStorage", () => {
  beforeEach(() => {
    process.env.DRIVE_TOKEN_ENC_KEY = "test-encryption-key-minimum-16-chars";
  });
  afterEach(() => {
    delete process.env.DRIVE_TOKEN_ENC_KEY;
  });

  it("암호화 후 복호화하면 원문 복원", () => {
    const original = "1//0abc-refresh-token-xyz";
    const enc = encryptForStorage(original);
    expect(enc).not.toBe(original);
    expect(decryptFromStorage(enc)).toBe(original);
  });

  it("같은 평문도 매번 다른 암호문 생성 (랜덤 IV)", () => {
    process.env.DRIVE_TOKEN_ENC_KEY = "same-enc-key-for-nonce-test-1234";
    const plain = "same-plaintext";
    expect(encryptForStorage(plain)).not.toBe(encryptForStorage(plain));
  });

  it("키가 달라지면 복호화 실패", () => {
    const enc = encryptForStorage("secret-token");
    process.env.DRIVE_TOKEN_ENC_KEY = "completely-different-key-xyz-1234";
    expect(() => decryptFromStorage(enc)).toThrow();
  });

  it("키 없으면 암호화 시도 시 오류", () => {
    delete process.env.DRIVE_TOKEN_ENC_KEY;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;
    expect(() => encryptForStorage("test")).toThrow(/DRIVE_TOKEN_ENC_KEY/);
  });

  it("키가 16자 미만이면 오류", () => {
    process.env.DRIVE_TOKEN_ENC_KEY = "short";
    expect(() => encryptForStorage("test")).toThrow(/짧습니다/);
  });
});

// ─── getDriveRefreshToken ─────────────────────────────────────────────────────

describe("getDriveRefreshToken", () => {
  afterEach(() => {
    clearDriveTokenCache();
    delete process.env.GOOGLE_DRIVE_OWNER_REFRESH_TOKEN;
  });

  it("env var가 있으면 DB 없이 즉시 반환", async () => {
    process.env.GOOGLE_DRIVE_OWNER_REFRESH_TOKEN = "env-refresh-token";
    const token = await getDriveRefreshToken();
    expect(token).toBe("env-refresh-token");
  });

  it("clearDriveTokenCache 호출 후 캐시 무효화", async () => {
    process.env.GOOGLE_DRIVE_OWNER_REFRESH_TOKEN = "first-token";
    await getDriveRefreshToken(); // 첫 호출 (env 경로)
    clearDriveTokenCache();
    process.env.GOOGLE_DRIVE_OWNER_REFRESH_TOKEN = "second-token";
    const token = await getDriveRefreshToken();
    expect(token).toBe("second-token");
  });
});
