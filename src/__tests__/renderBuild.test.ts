/**
 * Render 빌드 설정 검증
 * - render-build 스크립트에 prisma migrate deploy 포함
 * - prisma db push / migrate reset 미사용
 * - render.yaml이 render-build 스크립트를 호출
 * - migration 실패 시 빌드 실패 (deploy는 non-zero exit on failure)
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

describe("package.json render-build 스크립트", () => {
  let pkg: Record<string, any>;

  it("package.json 파싱 성공", () => {
    pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg).toBeTruthy();
  });

  it("render-build 스크립트 존재", () => {
    pkg = pkg ?? JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts).toHaveProperty("render-build");
  });

  it("render-build에 prisma migrate deploy 포함", () => {
    pkg = pkg ?? JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["render-build"]).toContain("prisma migrate deploy");
  });

  it("render-build에 prisma db push 없음", () => {
    pkg = pkg ?? JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["render-build"]).not.toContain("prisma db push");
  });

  it("render-build에 prisma migrate reset 없음", () => {
    pkg = pkg ?? JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["render-build"]).not.toContain("migrate reset");
  });

  it("render-build에 next build 포함 (앱 빌드)", () => {
    pkg = pkg ?? JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["render-build"]).toContain("next build");
  });
});

describe("render.yaml 배포 설정", () => {
  let yaml: string;

  it("render.yaml 파일 존재", () => {
    const p = path.join(ROOT, "render.yaml");
    expect(fs.existsSync(p)).toBe(true);
    yaml = fs.readFileSync(p, "utf8");
  });

  it("render.yaml buildCommand에 render-build 포함", () => {
    yaml = yaml ?? fs.readFileSync(path.join(ROOT, "render.yaml"), "utf8");
    expect(yaml).toContain("render-build");
  });

  it("render.yaml buildCommand에 db push 없음", () => {
    yaml = yaml ?? fs.readFileSync(path.join(ROOT, "render.yaml"), "utf8");
    expect(yaml).not.toContain("db push");
  });

  it("render.yaml buildCommand에 migrate reset 없음", () => {
    yaml = yaml ?? fs.readFileSync(path.join(ROOT, "render.yaml"), "utf8");
    expect(yaml).not.toContain("migrate reset");
  });
});
