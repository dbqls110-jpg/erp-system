"use server";

import { prisma } from "@/lib/prisma";
import { requireEditAccess } from "@/lib/actionGuards";
import { revalidatePath } from "next/cache";
import { createNotionEvent, updateNotionEvent, archiveNotionEvent } from "@/lib/notion";
import { getCalendarViewer } from "@/lib/calendarViewer";
import { canEditCalendar } from "@/lib/calendarVisibility";

/**
 * 일정을 고칠 수 있는 사람인지 확인한다.
 *
 * 파트너·거래처 계정은 읽기만 한다. 자기 프로젝트라도 일정을 바꾸게 두면 우리 쪽
 * 기록이 밖에서 바뀐다. 바꿔 달라는 말은 메신저로 받는 편이 맞다.
 */
async function requireCalendarEditor() {
  await requireEditAccess("calendar");
  const viewer = await getCalendarViewer();
  if (!viewer) throw new Error("Unauthorized");
  if (!canEditCalendar(viewer)) throw new Error("일정을 바꿀 권한이 없습니다.");
  return viewer;
}

async function normalizeProjectId(projectId?: string | null) {
  const normalizedProjectId = projectId?.trim() || null;
  if (!normalizedProjectId) return null;

  // 일정이 외부에 노출되기 전에 실제 프로젝트에 연결됐는지 확인해야 잘못된 링크를 막을 수 있다.
  const project = await prisma.project.findUnique({
    where: { id: normalizedProjectId },
    select: { id: true },
  });
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

  return normalizedProjectId;
}

export async function createCalendarEvent(data: {
  title: string;
  date: string;
  endDate?: string;
  color: string;
  projectId?: string | null;
}) {
  const session = await requireCalendarEditor();
  const projectId = await normalizeProjectId(data.projectId);

  const event = await prisma.calendarEvent.create({
    data: {
      title: data.title,
      date: data.date,
      endDate: data.endDate || null,
      color: data.color,
      projectId,
      createdBy: session.id,
    },
  });

  // Notion에도 생성 (성공 시 notionPageId 저장)
  const notionPageId = await createNotionEvent(data.title, data.date, data.endDate);
  if (notionPageId) {
    await prisma.calendarEvent.update({
      where: { id: event.id },
      data: { notionPageId },
    });
  }

  revalidatePath("/calendar");
}

export async function updateCalendarEvent(
  id: string,
  data: { title: string; date: string; endDate?: string; color: string; projectId?: string | null }
) {
  const session = await requireCalendarEditor();

  const event = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!event) throw new Error("일정을 찾을 수 없습니다.");

  if (event.createdBy !== session.id && session.role !== "admin") {
    throw new Error("수정 권한이 없습니다.");
  }

  const projectId = await normalizeProjectId(data.projectId);

  await prisma.calendarEvent.update({
    where: { id },
    data: {
      title: data.title,
      date: data.date,
      endDate: data.endDate || null,
      color: data.color,
      projectId,
    },
  });

  // Notion 동기화 (fire-and-forget)
  if (event.notionPageId) {
    void updateNotionEvent(event.notionPageId, data.title, data.date, data.endDate);
  }

  revalidatePath("/calendar");
}

export async function deleteCalendarEvent(id: string) {
  const session = await requireCalendarEditor();

  const event = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!event) throw new Error("일정을 찾을 수 없습니다.");

  if (event.createdBy !== session.id && session.role !== "admin") {
    throw new Error("삭제 권한이 없습니다.");
  }

  await prisma.calendarEvent.delete({ where: { id } });

  // Notion에서 보관(아카이브) 처리 (fire-and-forget)
  if (event.notionPageId) {
    void archiveNotionEvent(event.notionPageId);
  }

  revalidatePath("/calendar");
}
