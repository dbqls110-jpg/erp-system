/**
 * 마이그레이션 SQL 구조 검증
 * - 파일 존재 확인
 * - 추가형 작업만 포함 (DROP TABLE, DROP COLUMN 없음)
 * - CREATE TABLE IF NOT EXISTS 패턴 사용
 * - 필수 테이블 모두 포함
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../prisma/migrations/20260715000000_add_agent_realtime/migration.sql"
);

describe("20260715000000_add_agent_realtime migration.sql", () => {
  let sql: string;

  it("마이그레이션 파일이 존재함", () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
    sql = fs.readFileSync(MIGRATION_PATH, "utf8");
  });

  it("DROP TABLE 없음 (비파괴적 마이그레이션)", () => {
    sql = sql ?? fs.readFileSync(MIGRATION_PATH, "utf8");
    expect(sql.toUpperCase()).not.toContain("DROP TABLE");
  });

  it("DROP COLUMN 없음 (비파괴적 마이그레이션)", () => {
    sql = sql ?? fs.readFileSync(MIGRATION_PATH, "utf8");
    expect(sql.toUpperCase()).not.toContain("DROP COLUMN");
  });

  it("CREATE TABLE은 모두 IF NOT EXISTS 형태", () => {
    sql = sql ?? fs.readFileSync(MIGRATION_PATH, "utf8");
    const createTables = sql.match(/CREATE\s+TABLE\s+(?!IF NOT EXISTS)/gi);
    expect(createTables).toBeNull();
  });

  it("필수 테이블 agent_jobs 포함", () => {
    sql = sql ?? fs.readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toContain('"agent_jobs"');
  });

  it("필수 테이블 agent_job_deltas 포함", () => {
    sql = sql ?? fs.readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toContain('"agent_job_deltas"');
  });

  it("필수 테이블 agent_bridge_heartbeats 포함", () => {
    sql = sql ?? fs.readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toContain('"agent_bridge_heartbeats"');
  });

  it("status 컬럼 기본값 pending", () => {
    sql = sql ?? fs.readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toContain("'pending'");
  });

  it("agent_bridge_heartbeats에 agentType 유니크 인덱스", () => {
    sql = sql ?? fs.readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toContain("agent_bridge_heartbeats_agentType_key");
  });
});
