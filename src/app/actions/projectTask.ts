"use server";

import { revalidatePath } from "next/cache";
import { createProjectTask, editProjectTask, completeProjectTask, removeProjectTask, setProjectCompleted } from "@/lib/projectTasks";
import { parseTaskDraft, TaskConflictError, TaskInputError, type ProjectTask, type TaskResult } from "@/lib/projectTaskPolicy";
import { saveProjectWorkspace } from "@/lib/projectWorkspace";

function revalidateTask(projectId: string) {
  for (const path of ["/projects", `/projects/${projectId}`, "/calendar", "/dashboard"]) revalidatePath(path);
}
async function mutation<T>(run: () => Promise<T>): Promise<TaskResult<T>> {
  try { return { ok: true, data: await run() }; }
  catch (error) {
    if (error instanceof TaskInputError || error instanceof TaskConflictError) return { ok: false, message: error.message };
    return { ok: false, message: "변경사항을 저장하지 못했습니다. 권한과 연결 상태를 확인한 뒤 다시 시도해 주세요." };
  }
}
export async function setProjectCompletionAction(input: { projectId: string; completed: boolean; expectedStatus: string }) {
  return mutation(async () => {
    const result = await setProjectCompleted(input.projectId, input.completed, input.expectedStatus);
    revalidateTask(result.projectId);
    return result;
  });
}
export async function saveProjectWorkspaceAction(projectId: string, input: unknown, version: number) {
  return mutation(async () => {
    const result = await saveProjectWorkspace(projectId, input, version);
    revalidateTask(result.id);
    return result;
  });
}
export async function saveProjectTaskAction(input: unknown, identity: { kind: "create"; requestId: string } | { kind: "edit"; id: string; version: number }): Promise<TaskResult<ProjectTask>> {
  return mutation(async () => {
    const draft = parseTaskDraft(input);
    const task = identity.kind === "create"
      ? await createProjectTask(draft, identity.requestId)
      : await editProjectTask(identity.id, draft, identity.version);
    revalidateTask(task.projectId);
    return task;
  });
}
export async function completeProjectTaskAction(input: { id: string; projectId: string; done: boolean; version: number }): Promise<TaskResult<ProjectTask>> {
  return mutation(async () => {
    const task = await completeProjectTask(input.id, input.projectId, input.done, input.version);
    revalidateTask(task.projectId);
    return task;
  });
}
export async function deleteProjectTaskAction(input: { id: string; projectId: string; version: number }): Promise<TaskResult<{ id: string }>> {
  return mutation(async () => {
    const result = await removeProjectTask(input.id, input.projectId, input.version);
    revalidateTask(input.projectId);
    return result;
  });
}
