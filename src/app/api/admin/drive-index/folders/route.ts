import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { makeDriveClientAsOwner, parseFolderIdFromUrl } from "@/lib/googleClient";
import { DRIVE_INDEX_LIMITS, ensureDriveIndexSchema } from "@/lib/driveIndex";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === "admin";
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDriveIndexSchema();
  const [folders, fileCount, chunkCount, statusGroups] = await Promise.all([
    prisma.driveIndexFolder.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { files: true } } },
    }),
    prisma.driveIndexFile.count({ where: { status: { not: "deleted" } } }),
    prisma.driveIndexChunk.count(),
    prisma.driveIndexFile.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return NextResponse.json({
    folders,
    totals: {
      files: fileCount,
      chunks: chunkCount,
      byStatus: Object.fromEntries(statusGroups.map((group) => [group.status, group._count._all])),
    },
    limits: DRIVE_INDEX_LIMITS,
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDriveIndexSchema();
  const body = await req.json().catch(() => ({}));
  const raw = String(body.folderUrl ?? body.folderId ?? "").trim();
  const driveFolderId = parseFolderIdFromUrl(raw) ?? (/^[A-Za-z0-9_-]{10,100}$/.test(raw) ? raw : null);
  if (!driveFolderId) return NextResponse.json({ error: "올바른 Google Drive 폴더 URL 또는 ID가 필요합니다." }, { status: 400 });

  const drive = await makeDriveClientAsOwner();
  const response = await drive.files.get({
    fileId: driveFolderId,
    fields: "id,name,mimeType,webViewLink,trashed",
    supportsAllDrives: true,
  });
  if (response.data.trashed || response.data.mimeType !== "application/vnd.google-apps.folder") {
    return NextResponse.json({ error: "선택한 항목이 활성 Google Drive 폴더가 아닙니다." }, { status: 400 });
  }

  const folder = await prisma.driveIndexFolder.upsert({
    where: { driveFolderId },
    create: {
      driveFolderId,
      name: response.data.name ?? "Drive 폴더",
      webViewLink: response.data.webViewLink ?? raw,
    },
    update: {
      name: response.data.name ?? "Drive 폴더",
      webViewLink: response.data.webViewLink ?? raw,
      active: true,
    },
  });
  return NextResponse.json({ ok: true, folder }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDriveIndexSchema();
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  const allowedRoles = Array.isArray(body.allowedRoles)
    ? body.allowedRoles.filter((role: unknown): role is string => role === "admin" || role === "user")
    : undefined;
  const folder = await prisma.driveIndexFolder.update({
    where: { id },
    data: {
      ...(typeof body.active === "boolean" ? { active: body.active } : {}),
      ...(allowedRoles && allowedRoles.length > 0 ? { allowedRoles } : {}),
    },
  });
  return NextResponse.json({ ok: true, folder });
}
