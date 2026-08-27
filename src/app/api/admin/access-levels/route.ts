import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateMenuAccessCache } from "@/lib/permissions";

/**
 * 접근 레벨과 메뉴 권한 관리.
 *
 * rank 는 순서를 나타내는 내부 값이라 클라이언트가 숫자를 직접 보내지 않는다.
 * 새 레벨은 서버가 맨 아래에 붙이고, 순서 변경은 위/아래 이동으로만 받는다.
 * 관리자에게 "50 과 60 중 뭘 넣나"를 묻는 화면이 되지 않게 하기 위함이다.
 */

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === "admin";
}

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function GET() {
  if (!(await requireAdmin())) return unauthorized();

  try {
    const [levels, menuAccess] = await Promise.all([
      prisma.accessLevel.findMany({ orderBy: { rank: "desc" } }),
      prisma.menuAccess.findMany({
        select: { menuKey: true, levelKey: true, canView: true, canEdit: true },
      }),
    ]);

    return NextResponse.json({ levels, menuAccess });
  } catch (error) {
    console.error("[Access Levels GET Error]", error);
    return NextResponse.json({ error: "접근 레벨을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return unauthorized();

  try {
    const body = (await request.json()) as { name?: unknown; key?: unknown };

    if (!isNonEmptyString(body.name) || !isNonEmptyString(body.key)) {
      return NextResponse.json({ error: "이름과 key 가 필요합니다." }, { status: 400 });
    }

    const key = body.key.trim();
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      return NextResponse.json(
        { error: "key 는 영문 소문자로 시작하고 소문자·숫자·밑줄만 쓸 수 있습니다." },
        { status: 400 },
      );
    }

    // 새 레벨은 항상 맨 아래에 붙인다. 순서는 만든 뒤 위/아래로 옮긴다.
    const lowest = await prisma.accessLevel.findFirst({
      orderBy: { rank: "asc" },
      select: { rank: true },
    });
    const rank = lowest ? lowest.rank - 10 : 10;

    const level = await prisma.accessLevel.create({
      data: { name: body.name.trim(), key, rank },
    });

    invalidateMenuAccessCache();
    return NextResponse.json(level, { status: 201 });
  } catch (error) {
    console.error("[Access Levels POST Error]", error);
    return NextResponse.json({ error: "접근 레벨을 추가하지 못했습니다." }, { status: 500 });
  }
}

/** 메뉴 한 줄(메뉴 × 전체 레벨)의 권한을 통째로 저장한다. */
async function saveMenuAccess(menuKey: string, entries: unknown) {
  if (!Array.isArray(entries)) {
    return NextResponse.json({ error: "entries 가 필요합니다." }, { status: 400 });
  }

  const parsed: { levelKey: string; canView: boolean; canEdit: boolean }[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) {
      return NextResponse.json({ error: "entries 형식이 잘못됐습니다." }, { status: 400 });
    }
    const e = entry as Record<string, unknown>;
    if (!isNonEmptyString(e.levelKey) || !isBoolean(e.canView) || !isBoolean(e.canEdit)) {
      return NextResponse.json({ error: "entries 형식이 잘못됐습니다." }, { status: 400 });
    }
    // 접근 없이 수정만 켜진 조합은 의미가 없으므로 저장 단계에서 정리한다.
    parsed.push({ levelKey: e.levelKey, canView: e.canView, canEdit: e.canView && e.canEdit });
  }

  // 같은 레벨이 두 번 오면 유니크 제약에 걸린다. 뒤에 온 값을 남긴다.
  const byLevel = new Map(parsed.map((p) => [p.levelKey, p]));
  // 아무 권한도 없는 행은 저장하지 않는다. 행이 없는 것과 같은 뜻이다.
  const rows = [...byLevel.values()].filter((r) => r.canView || r.canEdit);

  await prisma.$transaction(async (tx) => {
    await tx.menuAccess.deleteMany({ where: { menuKey } });
    if (rows.length > 0) {
      await tx.menuAccess.createMany({ data: rows.map((r) => ({ menuKey, ...r })) });
    }
  });

  invalidateMenuAccessCache();
  return NextResponse.json({ menuKey, entries: rows });
}

export async function PATCH(request: Request) {
  if (!(await requireAdmin())) return unauthorized();

  try {
    const body = (await request.json()) as Record<string, unknown>;

    // 1) 메뉴 권한 저장
    if (body.menuKey !== undefined) {
      if (!isNonEmptyString(body.menuKey)) {
        return NextResponse.json({ error: "menuKey 가 필요합니다." }, { status: 400 });
      }
      return await saveMenuAccess(body.menuKey, body.entries);
    }

    if (!isNonEmptyString(body.id)) {
      return NextResponse.json({ error: "id 가 필요합니다." }, { status: 400 });
    }
    const id = body.id;

    // 2) 순서 이동. 바로 위/아래 레벨과 rank 를 맞바꾼다.
    if (body.direction !== undefined) {
      if (body.direction !== "up" && body.direction !== "down") {
        return NextResponse.json({ error: "direction 이 잘못됐습니다." }, { status: 400 });
      }

      const current = await prisma.accessLevel.findUnique({ where: { id } });
      if (!current) {
        return NextResponse.json({ error: "레벨을 찾을 수 없습니다." }, { status: 404 });
      }

      const neighbor = await prisma.accessLevel.findFirst({
        where:
          body.direction === "up" ? { rank: { gt: current.rank } } : { rank: { lt: current.rank } },
        orderBy: { rank: body.direction === "up" ? "asc" : "desc" },
      });
      // 이미 맨 끝이면 아무 일도 하지 않는다. 오류는 아니다.
      if (!neighbor) return NextResponse.json({ moved: false });

      // 같은 rank 가 잠시라도 겹치면 정렬이 흔들리므로 임시값을 거쳐 맞바꾼다.
      await prisma.$transaction([
        prisma.accessLevel.update({ where: { id: current.id }, data: { rank: -1 } }),
        prisma.accessLevel.update({ where: { id: neighbor.id }, data: { rank: current.rank } }),
        prisma.accessLevel.update({ where: { id: current.id }, data: { rank: neighbor.rank } }),
      ]);

      invalidateMenuAccessCache();
      return NextResponse.json({ moved: true });
    }

    // 3) 이름 변경. key 와 순서는 여기서 바꾸지 않는다.
    if (!isNonEmptyString(body.name)) {
      return NextResponse.json({ error: "이름이 필요합니다." }, { status: 400 });
    }

    const level = await prisma.accessLevel.update({
      where: { id },
      data: { name: body.name.trim() },
    });
    return NextResponse.json(level);
  } catch (error) {
    console.error("[Access Levels PATCH Error]", error);
    return NextResponse.json({ error: "설정을 저장하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await requireAdmin())) return unauthorized();

  try {
    const body = (await request.json()) as { id?: unknown };
    if (!isNonEmptyString(body.id)) {
      return NextResponse.json({ error: "id 가 필요합니다." }, { status: 400 });
    }

    const level = await prisma.accessLevel.findUnique({
      where: { id: body.id },
      select: { key: true, isSystem: true },
    });

    if (!level) {
      return NextResponse.json({ error: "레벨을 찾을 수 없습니다." }, { status: 404 });
    }
    if (level.isSystem) {
      return NextResponse.json({ error: "시스템 레벨은 삭제할 수 없습니다." }, { status: 400 });
    }

    // 이 레벨을 쓰는 사용자가 남아 있으면 지우지 않는다. 지우면 그 사람들의 role 이
    // 어느 레벨에도 안 걸려 전 메뉴에서 잠긴다.
    const inUse = await prisma.user.count({ where: { role: level.key } });
    if (inUse > 0) {
      return NextResponse.json(
        { error: `이 레벨을 쓰는 사용자가 ${inUse}명 있습니다. 먼저 다른 레벨로 옮겨주세요.` },
        { status: 400 },
      );
    }

    await prisma.$transaction([
      prisma.menuAccess.deleteMany({ where: { levelKey: level.key } }),
      prisma.accessLevel.delete({ where: { id: body.id } }),
    ]);

    invalidateMenuAccessCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Access Levels DELETE Error]", error);
    return NextResponse.json({ error: "레벨을 삭제하지 못했습니다." }, { status: 500 });
  }
}
