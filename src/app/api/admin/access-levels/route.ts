import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type AccessLevelInput = {
  name?: unknown;
  key?: unknown;
  rank?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = prisma as any;
    const [levels, menuAccess] = await Promise.all([
      db.accessLevel.findMany({ orderBy: { rank: "desc" } }),
      db.menuAccess.findMany(),
    ]);

    return NextResponse.json({ levels, menuAccess });
  } catch (error) {
    console.error("[Access Levels GET Error]", error);
    return NextResponse.json({ error: "Failed to fetch access levels" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as AccessLevelInput;

    if (!isNonEmptyString(body.name) || !isNonEmptyString(body.key) || !isInteger(body.rank)) {
      return NextResponse.json({ error: "name, key, and integer rank are required" }, { status: 400 });
    }

    const level = await (prisma as any).accessLevel.create({
      data: { name: body.name, key: body.key, rank: body.rank },
    });

    return NextResponse.json(level, { status: 201 });
  } catch (error) {
    console.error("[Access Levels POST Error]", error);
    return NextResponse.json({ error: "Failed to create access level" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as AccessLevelInput & {
      id?: unknown;
      menuKey?: unknown;
      levelKeys?: unknown;
    };
    const db = prisma as any;

    if (body.menuKey !== undefined) {
      if (
        !isNonEmptyString(body.menuKey) ||
        !Array.isArray(body.levelKeys) ||
        body.levelKeys.some((levelKey) => !isNonEmptyString(levelKey))
      ) {
        return NextResponse.json({ error: "menuKey and levelKeys are required" }, { status: 400 });
      }

      const levelKeys = [...new Set(body.levelKeys as string[])];

      await db.$transaction(async (transaction: any) => {
        await transaction.menuAccess.deleteMany({ where: { menuKey: body.menuKey } });
        if (levelKeys.length > 0) {
          await transaction.menuAccess.createMany({
            data: levelKeys.map((levelKey) => ({ menuKey: body.menuKey, levelKey })),
          });
        }
      });

      return NextResponse.json({ menuKey: body.menuKey, levelKeys });
    }

    if (!isNonEmptyString(body.id)) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const data: { name?: string; rank?: number } = {};
    if (body.name !== undefined) {
      if (!isNonEmptyString(body.name)) {
        return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
      data.name = body.name;
    }
    if (body.rank !== undefined) {
      if (!isInteger(body.rank)) {
        return NextResponse.json({ error: "rank must be an integer" }, { status: 400 });
      }
      data.rank = body.rank;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "name or rank is required" }, { status: 400 });
    }

    const level = await db.accessLevel.update({ where: { id: body.id }, data });
    return NextResponse.json(level);
  } catch (error) {
    console.error("[Access Levels PATCH Error]", error);
    return NextResponse.json({ error: "Failed to update access level" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { id?: unknown };
    if (!isNonEmptyString(body.id)) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const db = prisma as any;
    const level = await db.accessLevel.findUnique({
      where: { id: body.id },
      select: { isSystem: true },
    });

    if (!level) {
      return NextResponse.json({ error: "Access level not found" }, { status: 404 });
    }
    if (level.isSystem === true) {
      return NextResponse.json({ error: "System access levels cannot be deleted" }, { status: 400 });
    }

    await db.accessLevel.delete({ where: { id: body.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Access Levels DELETE Error]", error);
    return NextResponse.json({ error: "Failed to delete access level" }, { status: 500 });
  }
}
