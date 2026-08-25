import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SheetList } from "./SheetList";

export default async function SheetsPage() {
  const session = await getServerSession(authOptions);
  const sheets = await prisma.sheetLink.findMany({ orderBy: [{ category: "asc" }, { order: "asc" }, { createdAt: "asc" }] });

  return (
    <div className="space-y-4">
      <div><p className="mt-1 text-sm text-muted-foreground">{"\uAD6C\uAE00 \uC2DC\uD2B8 \uB9C1\uD06C\uB97C \uD655\uC778\uD558\uACE0 \uD544\uC694\uD55C \uBB38\uC11C\uC5D0 \uC811\uADFC\uD558\uC138\uC694."}</p></div>
      <SheetList sheets={sheets} isAdmin={session?.user?.role === "admin"} />
    </div>
  );
}