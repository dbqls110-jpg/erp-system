import { describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";

vi.mock("@/lib/googleDrive", () => ({ findProjectUploadInDrive: vi.fn() }));

describe.skipIf(!process.env.ERP_QUOTE_DB_TEST)("매출·매입 견적서 PostgreSQL 저장", () => {
  it("서로 다른 매입 2건을 합산하고, 매출 2장·복구 재생·원본 중복을 합산하지 않는다", async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "55433" || url.pathname !== "/erp_cost_test") {
      throw new Error("Isolated fixture database required");
    }
    const { prisma } = await import("@/lib/prisma");
    const { beginProjectUpload, finishProjectUpload } = await import("@/lib/projectUploadRecovery");
    const project = await prisma.project.create({ data: { name: `견적서 기능 테스트 ${randomUUID()}` } });
    const context = { projectId: project.id, createdById: "fixture", mimeType: "application/pdf", size: 10 };
    const source = { confidence: "high" as const, source: "pdf-text" as const, note: "", matchedLabels: [] };
    async function begin(name: string, payload: string, amount: number, kind: "revenue" | "cost") {
      const items = kind === "cost" ? [{ name: "운영 장비", quantity: 2, unitPrice: amount / 2, amount }] : undefined;
      const contentSha256 = createHash("sha256").update(payload).digest("hex");
      return beginProjectUpload({ ...context, name, contentSha256 }, {
        ...source, revenue: kind === "revenue" ? amount : null, cost: kind === "cost" ? amount : null, items,
      });
    }
    function finish(task: { id: string }) {
      return finishProjectUpload(task.id, { driveFileId: task.id, driveUrl: "https://example.invalid/fixture", category: "견적서" });
    }
    try {
      const [receipt, a, b] = await Promise.all([
        begin("행사 매출.pdf", "invoice-sale", 1_000_000, "revenue"),
        begin("장비 매입.pdf", "invoice-a", 200_000, "cost"),
        begin("설치 매입.pdf", "invoice-b", 200_000, "cost"),
      ]);
      expect(await Promise.all([finish(receipt), finish(a), finish(a), finish(b)]))
        .toEqual(Array.from({ length: 4 }, () => ({ amountsApplied: true })));
      const saleDuplicate = await begin("추가 매출.pdf", "invoice-sale-other", 500_000, "revenue");
      const renamedCopy = await begin("복사본 매입.pdf", "invoice-a", 200_000, "cost");
      expect(await finish(saleDuplicate)).toEqual({ amountsApplied: false });
      expect(await finish(renamedCopy)).toEqual({ amountsApplied: false });
      const saved = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, include: { amounts: true } });
      expect(saved).toMatchObject({ revenue: 1_000_000, cost: 400_000 });
      expect(saved.amounts).toHaveLength(3);
      expect(saved.amounts.filter(row => row.kind === "cost").map(row => row.quoteItems)).toEqual(
        Array.from({ length: 2 }, () => [{ name: "운영 장비", quantity: 2, unitPrice: 100_000, amount: 200_000 }]),
      );
    } finally {
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.$disconnect();
    }
  }, 30_000);
});
