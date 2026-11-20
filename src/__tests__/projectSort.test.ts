import { describe, expect, it } from "vitest";
import { sortProjects } from "@/lib/projectSort";

const rows = [{ name: "라", deadline: null }, { name: "다", deadline: "2026-12-20" }, { name: "나", deadline: "2026-11-20" }, { name: "가", deadline: "2026-02-30" }];
describe("프로젝트 정렬", () => {
  it("마감 가까운 순은 실제 마감일만 비교하고 날짜 미정·잘못된 날짜는 뒤로 보낸다", () => {
    expect(sortProjects(rows, "deadline").map(row => row.name)).toEqual(["나", "다", "라", "가"]);
    expect(rows[0].deadline).toBeNull();
  });
  it("최근 등록순은 서버의 최신순을 유지하며 이름순은 별도 복사본만 정렬한다", () => {
    expect(sortProjects(rows, "recent")).toEqual(rows);
    expect(sortProjects(rows, "name").map(row => row.name)).toEqual(["가", "나", "다", "라"]);
    expect(rows.map(row => row.name)).toEqual(["라", "다", "나", "가"]);
  });
});
