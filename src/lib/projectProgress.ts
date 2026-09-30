/** Completed projects are presented as 100%, including older rows that still store 0%. */
export function getDisplayedProjectProgress(status: string, progress: number): number {
  return status === "completed" ? 100 : progress;
}
