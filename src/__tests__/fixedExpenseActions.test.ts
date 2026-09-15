import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    fixedExpense: {
      findUnique: vi.fn(),
      update: vi.fn(async () => undefined),
      create: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    },
  };
  const prisma = {
    fixedExpense: { count: vi.fn(async () => 0) },
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  return { prisma, tx };
});

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { role: "admin" } })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/actionGuards", () => ({ requireEditAccess: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteFixedExpense, updateFixedExpense } from "@/app/actions/fixedExpense";

const oldExpense = {
  id: "fixed-old",
  name: "임대료",
  amount: 1_000_000,
  dayOfMonth: 10,
  category: "rent",
  order: 4,
  startMonth: "2026-06",
  endMonth: null,
};

describe("고정비 기간 액션", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.fixedExpense.findUnique.mockResolvedValue(oldExpense);
  });

  it("9월 수정은 옛 행을 8월에 끝내고 같은 순서의 새 행을 9월에 만든다", async () => {
    await updateFixedExpense(
      oldExpense.id,
      { name: "임대료", amount: 1_200_000, dayOfMonth: 10, category: "rent" },
      2026,
      9,
    );

    expect(mocks.tx.fixedExpense.update).toHaveBeenCalledWith({
      where: { id: oldExpense.id },
      data: { endMonth: "2026-08" },
    });
    expect(mocks.tx.fixedExpense.create).toHaveBeenCalledWith({
      data: {
        name: "임대료",
        amount: 1_200_000,
        dayOfMonth: 10,
        category: "rent",
        order: 4,
        startMonth: "2026-09",
        endMonth: null,
      },
    });
  });

  it("시작한 달 수정은 제자리에서 고친다", async () => {
    mocks.tx.fixedExpense.findUnique.mockResolvedValue({ ...oldExpense, startMonth: "2026-09" });

    await updateFixedExpense(
      oldExpense.id,
      { name: "임대료", amount: 1_100_000, dayOfMonth: 10, category: "rent" },
      2026,
      9,
    );

    expect(mocks.tx.fixedExpense.update).toHaveBeenCalledWith({
      where: { id: oldExpense.id },
      data: { name: "임대료", amount: 1_100_000, dayOfMonth: 10, category: "rent" },
    });
    expect(mocks.tx.fixedExpense.create).not.toHaveBeenCalled();
  });

  it("같은 달 삭제는 실제 삭제하고, 뒤 달 삭제는 전달에 끝낸다", async () => {
    mocks.tx.fixedExpense.findUnique.mockResolvedValue({ ...oldExpense, startMonth: "2026-09" });
    await deleteFixedExpense(oldExpense.id, 2026, 9);
    expect(mocks.tx.fixedExpense.delete).toHaveBeenCalledWith({ where: { id: oldExpense.id } });

    vi.clearAllMocks();
    mocks.tx.fixedExpense.findUnique.mockResolvedValue(oldExpense);
    await deleteFixedExpense(oldExpense.id, 2026, 9);
    expect(mocks.tx.fixedExpense.update).toHaveBeenCalledWith({
      where: { id: oldExpense.id },
      data: { endMonth: "2026-08" },
    });
  });
});
