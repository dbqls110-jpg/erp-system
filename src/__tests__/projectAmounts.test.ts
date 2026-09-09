import { describe, expect, it, vi } from "vitest";
import { calculateNetIncome } from "@/lib/financeMetrics";
import { recalculateProjectTotals, upsertQuoteAmounts } from "@/lib/projectAmounts";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

interface StoredAmount {
  id: string;
  projectId: string;
  kind: string;
  amount: number;
  label: string | null;
  sourceFileName: string | null;
}

function makeDb(initial: StoredAmount[]) {
  const rows = [...initial];
  const projectUpdate = vi.fn(async () => undefined);
  const projectAmount = {
    findMany: vi.fn(async () => rows.map(({ kind, amount }) => ({ kind, amount }))),
    findFirst: vi.fn(async ({ where }: { where: { projectId: string; kind: string; sourceFileName: string } }) =>
      rows.find((row) => row.projectId === where.projectId && row.kind === where.kind && row.sourceFileName === where.sourceFileName) ?? null),
    create: vi.fn(async ({ data }: { data: Omit<StoredAmount, "id"> }) => {
      const row = { id: `amount-${rows.length + 1}`, ...data };
      rows.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<StoredAmount> }) => {
      const row = rows.find((item) => item.id === where.id);
      if (!row) throw new Error("row not found");
      Object.assign(row, data);
      return row;
    }),
  };

  return {
    rows,
    projectUpdate,
    db: { projectAmount, project: { update: projectUpdate } },
  };
}

describe("프로젝트 매출·매입 건 집계", () => {
  it("매출 2건과 매입 1건의 합계를 projects에 쓴다", async () => {
    const mock = makeDb([
      { id: "r1", projectId: "p1", kind: "revenue", amount: 1_000, label: "기본", sourceFileName: null },
      { id: "r2", projectId: "p1", kind: "revenue", amount: 250, label: "추가", sourceFileName: null },
      { id: "c1", projectId: "p1", kind: "cost", amount: 300, label: "기본", sourceFileName: null },
    ]);

    await expect(recalculateProjectTotals("p1", mock.db as never)).resolves.toEqual({ revenue: 1_250, cost: 300 });
    expect(mock.projectUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { revenue: 1_250, cost: 300 },
    });
  });

  it("건이 모두 없으면 두 합계를 null로 쓴다", async () => {
    const mock = makeDb([]);

    await expect(recalculateProjectTotals("p1", mock.db as never)).resolves.toEqual({ revenue: null, cost: null });
    expect(mock.projectUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { revenue: null, cost: null },
    });
  });

  it("같은 견적서 파일을 다시 반영해도 구분별 건 하나씩만 유지한다", async () => {
    const mock = makeDb([]);
    const analysis = { revenue: 10_000, cost: 6_000 };

    await upsertQuoteAmounts("p1", "견적서.pdf", analysis, mock.db as never);
    await upsertQuoteAmounts("p1", "견적서.pdf", { revenue: 12_000, cost: 7_000 }, mock.db as never);

    expect(mock.rows).toHaveLength(2);
    expect(mock.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "revenue", amount: 12_000, label: "견적서", sourceFileName: "견적서.pdf" }),
      expect.objectContaining({ kind: "cost", amount: 7_000, label: "견적서", sourceFileName: "견적서.pdf" }),
    ]));
  });

  it("당기순이익은 영업이익의 79%를 원 미만 버림으로 계산한다", () => {
    expect(calculateNetIncome(1_700, 300)).toBe(1_106);
  });
});
