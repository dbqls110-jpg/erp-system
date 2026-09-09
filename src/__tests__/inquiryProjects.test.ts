import { describe, expect, it } from "vitest";
import {
  buildInquiryProjectMemo,
  projectCreateData,
  spaceRentalCustomerSeed,
  spaceRentalProjectSeed,
} from "@/lib/inquiryProjects";
import { parseInquiryRows } from "@/lib/inquiries";
import { parseSpaceRentalRows } from "@/lib/spaceRentals";

describe("문의·공간대관 프로젝트 전환 값", () => {
  it("공간대관은 원청을 client와 거래처 이름에 넣고 예약자를 manager로 넣는다", () => {
    const values = Array.from({ length: 39 }, () => "");
    values[0] = "In";
    values[1] = "RSV-001";
    values[3] = "담당자";
    values[4] = "예약자";
    values[5] = "client@example.com";
    values[6] = "원청 회사";
    values[8] = "010-1234-5678";
    values[10] = "행사명";
    values[22] = "성사";
    const rental = parseSpaceRentalRows([["구분"], values])[0];

    expect(spaceRentalProjectSeed(rental, "")).toMatchObject({
      name: "행사명",
      client: "원청 회사",
      assignee: "담당자",
    });
    expect(spaceRentalCustomerSeed(rental)).toEqual({
      name: "원청 회사",
      manager: "예약자",
      phone: "010-1234-5678",
      email: "client@example.com",
    });
  });

  it("원청이 없으면 거래처 이름은 예약자이고 manager는 비운다", () => {
    const values = Array.from({ length: 39 }, () => "");
    values[0] = "In";
    values[1] = "RSV-002";
    values[4] = "예약자";
    values[5] = "client@example.com";
    const rental = parseSpaceRentalRows([["구분"], values])[0];

    expect(spaceRentalCustomerSeed(rental)).toMatchObject({ name: "예약자", manager: null });
  });

  it("고객 문의의 최근 대관 필드도 프로젝트 메모에 남긴다", () => {
    const values = Array.from({ length: 27 }, () => "");
    values[0] = "2026-09-09 10:00";
    values[1] = "예약자";
    values[15] = "2026-10-01";
    values[16] = "2026-10-02";
    values[18] = "120";
    values[19] = "500";
    values[22] = "선택 공간";
    const inquiry = parseInquiryRows([["접수일시"], values])[0];
    const memo = buildInquiryProjectMemo(inquiry);

    expect(memo).toContain("대관 시작일: 2026-10-01");
    expect(memo).toContain("대관 종료일: 2026-10-02");
    expect(memo).toContain("예상 최대 참석 인원: 120");
    expect(memo).toContain("총 대관 예산: 500");
    expect(memo).toContain("선택 공간명: 선택 공간");
  });

  it("프로젝트 company에는 원청을 절대 넣지 않는다", () => {
    const data = projectCreateData({ name: "행사명", client: "원청 회사", assignee: "담당자", memo: "메모" });

    expect(data).toEqual({ name: "행사명", client: "원청 회사", assignee: "담당자", memo: "메모", status: "active" });
    expect(data).not.toHaveProperty("company");
  });
});
