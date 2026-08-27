/**
 * 클라이언트 폴링 규칙 검증
 *
 * 배경: 가시성 체크 없는 setInterval 폴러가 백그라운드 탭에서 계속 돌아 DB를 하루 종일
 * 깨워놨고, Neon 무료 플랜 컴퓨트 시간이 소진돼 Supabase로 이전해야 했다. 이 테스트는
 * 그 사고가 재발하는 두 가지 경로를 막는다.
 *
 * 1. useVisiblePolling 훅 자체가 무한 요청 루프를 유발하지 않을 것
 * 2. 훅을 우회한 새 폴러가 클라이언트 컴포넌트에 생기지 않을 것
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const HOOK = path.join(ROOT, "src/lib/useVisiblePolling.ts");

describe("useVisiblePolling", () => {
  const src = fs.readFileSync(HOOK, "utf8");

  it("즉시 실행 effect가 callback identity에 의존하지 않는다", () => {
    // callback 을 deps 에 넣으면, 메모이즈 안 된 인라인 콜백을 받았을 때
    // fetch -> setState -> 리렌더 -> 새 identity -> fetch 무한 루프가 된다.
    const immediateEffect = src.match(
      /if \(immediate\) callbackRef\.current\(\);\s*\}, \[([^\]]*)\]\);/,
    );
    expect(immediateEffect, "즉시 실행 effect를 찾지 못함 - 구조가 바뀌었으면 이 테스트도 갱신할 것").toBeTruthy();

    const deps = immediateEffect![1].split(",").map(d => d.trim()).filter(Boolean);
    expect(deps).not.toContain("callback");
    expect(deps).toContain("refreshKey");
  });

  it("즉시 실행이 callback 이 아니라 callbackRef 를 호출한다", () => {
    expect(src).toContain("if (immediate) callbackRef.current();");
  });

  it("주기 폴링이 탭 가시성으로 게이트된다", () => {
    expect(src).toContain('document.visibilityState !== "visible"');
  });

  it("탭 복귀 시 즉시 갱신 리스너를 등록/해제한다", () => {
    expect(src).toContain('document.addEventListener("visibilitychange", run)');
    expect(src).toContain('document.removeEventListener("visibilitychange", run)');
  });

  it("respectQuietHours 기본값은 false", () => {
    // 가시성 게이팅만으로 DB 문제는 해결된다. 기본으로 켜면 야근/시차 근무자에게
    // 화면이 안내 없이 멈춘 것처럼 보인다.
    expect(src).toMatch(/respectQuietHours\s*=\s*false/);
  });
});

describe("클라이언트 폴러는 useVisiblePolling 을 거친다", () => {
  // 예외 목록. 새로 추가하려면 반드시 이유를 적을 것.
  const ALLOWED = new Map<string, string>([
    // 로컬 시계 계산만 하고 네트워크/DB를 건드리지 않음
    ["src/app/(app)/attendance/WorkingTimer.tsx", "fetch 없음, 근무시간 표시용 로컬 타이머"],
    // 자체 visibleRef + isQuietHours 게이트를 이미 갖고 있음. 동작 중인 실시간
    // 파이프라인이라 리스크를 피해 그대로 뒀다. 훅으로 통일하면 여기서 지우면 됨.
    ["src/app/(app)/messenger/MessengerView.tsx", "자체 visibleRef 게이트 보유"],
  ]);

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  it("게이트되지 않은 setInterval 폴러가 없다", () => {
    const offenders = walk(path.join(ROOT, "src"))
      .filter(f => fs.readFileSync(f, "utf8").includes("setInterval("))
      .map(f => path.relative(ROOT, f).split(path.sep).join("/"))
      .filter(rel => !ALLOWED.has(rel));

    expect(
      offenders,
      `클라이언트 컴포넌트에서 setInterval 을 직접 쓰지 마세요. ` +
        `src/lib/useVisiblePolling.ts 를 사용하세요. ` +
        `가시성 체크 없는 폴러는 백그라운드 탭에서 DB를 계속 깨웁니다. ` +
        `해당 파일: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
