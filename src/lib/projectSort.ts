export const PROJECT_SORT_LABELS = { recent: "최근 등록순", deadline: "마감 가까운 순", name: "이름순" };
export type ProjectSort = keyof typeof PROJECT_SORT_LABELS;

function deadlineKey(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "9999";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "9999";
}

export function sortProjects<T extends { name: string; deadline: string | null }>(projects: readonly T[], sort: ProjectSort): T[] {
  const copy = [...projects];
  if (sort === "deadline") return copy.sort((a, b) => deadlineKey(a.deadline).localeCompare(deadlineKey(b.deadline)));
  if (sort === "name") return copy.sort((a, b) => a.name.localeCompare(b.name, "ko-KR"));
  return copy;
}
