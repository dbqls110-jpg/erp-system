import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("메뉴 권한 진입점", () => {
  const guardedPages = [
    ["src/app/(app)/attendance/page.tsx", "attendance"],
    ["src/app/(app)/calendar/page.tsx", "calendar"],
    ["src/app/(app)/company-finance/page.tsx", "companyFinance"],
    ["src/app/(app)/credentials/page.tsx", "credentials"],
    ["src/app/(app)/customers/page.tsx", "customers"],
    ["src/app/(app)/finance/page.tsx", "finance"],
    ["src/app/(app)/leave/page.tsx", "leave"],
    ["src/app/(app)/messenger/page.tsx", "messenger"],
    ["src/app/(app)/partners/page.tsx", "partners"],
    ["src/app/(app)/projects/page.tsx", "projects"],
    ["src/app/(app)/projects/stats/page.tsx", "projects"],
    ["src/app/(app)/projects/[id]/page.tsx", "projects"],
    ["src/app/(app)/sheets/page.tsx", "sheets"],
    ["src/app/(app)/venues/page.tsx", "venues"],
  ] as const;

  it.each(guardedPages)("%s 는 %s 메뉴 권한을 확인한다", (file, menuKey) => {
    const source = read(file);
    expect(source).toContain("requireMenuAccess");
    expect(source).toContain(`"${menuKey}"`);
  });

  it("프로젝트 상세 권한 검사는 프로젝트 조회보다 앞에 있다", () => {
    const source = read("src/app/(app)/projects/[id]/page.tsx");
    expect(source.indexOf('requireMenuAccess(session!.user.id, "projects"')).toBeLessThan(
      source.indexOf("prisma.project.findUnique"),
    );
  });
});

describe("공유 자료를 바꾸는 서버 액션 권한", () => {
  const guardedActions = [
    ["src/app/actions/projectFile.ts", ["uploadProjectFile", "deleteProjectFile"], "projects"],
    [
      "src/app/actions/project.ts",
      [
        "createProject",
        "updateProject",
        "addChecklistItem",
        "updateChecklistItem",
        "toggleChecklistItem",
        "deleteChecklistItem",
        "updateProjectMemo",
      ],
      "projects",
    ],
    ["src/app/actions/finance.ts", ["addExpense"], "finance"],
    ["src/app/actions/fixedExpense.ts", ["checkFixedExpense", "uncheckFixedExpense"], "finance"],
  ] as const;

  it.each(guardedActions)("%s 의 공유 자료 액션은 수정 권한을 확인한다", (file, functions, menuKey) => {
    const source = read(file);
    for (const functionName of functions) {
      const start = source.indexOf(`export async function ${functionName}`);
      const next = source.indexOf("\nexport async function ", start + 1);
      const body = source.slice(start, next === -1 ? source.length : next);

      expect(start, `${file} 의 ${functionName} 액션을 찾을 수 없습니다.`).toBeGreaterThanOrEqual(0);
      expect(body).toContain(`requireEditAccess("${menuKey}")`);
    }
  });

  it("캘린더 수정 가드도 메뉴 수정 권한을 확인한다", () => {
    const source = read("src/app/actions/calendar.ts");
    const start = source.indexOf("async function requireCalendarEditor");
    const next = source.indexOf("\n}", start);
    expect(source.slice(start, next)).toContain('requireEditAccess("calendar")');
  });
});

describe("삭제 확인과 캘린더 빈 상태 안내", () => {
  it("고정비와 일정 삭제 전에 이름을 포함한 확인을 거친다", () => {
    expect(read("src/app/(app)/finance/FixedExpensePanel.tsx")).toContain(
      'confirm(`"${item.name}" 고정비 항목을 삭제하시겠습니까?`)',
    );
    expect(read("src/app/(app)/calendar/CalendarView.tsx")).toContain(
      'confirm(`"${title}" 일정을 삭제하시겠습니까?`)',
    );
  });

  it("캘린더 빈 상태 문구는 외부 사용자와 내부 사용자를 나눈다", () => {
    const source = read("src/app/(app)/calendar/CalendarView.tsx");
    expect(source).toContain("hasVisibleEvents");
    expect(source).toContain("isExternalViewer");
    expect(source).toContain("표시할 프로젝트 마감일이 없습니다.");
    expect(source).toContain("날짜를 눌러 추가하세요.");
  });
});
