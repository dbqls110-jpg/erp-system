import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SheetList } from "./SheetList";

export default async function SheetsPage() {
  const session = await getServerSession(authOptions);
  const sheets = await prisma.sheetLink.findMany({ orderBy: [{ category: "asc" }, { order: "asc" }, { createdAt: "asc" }] });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)", letterSpacing: "-0.91px" }}>
        구글 시트
      </h1>
      <SheetList sheets={sheets} isAdmin={session?.user?.role === "admin"} />
    </div>
  );
}
