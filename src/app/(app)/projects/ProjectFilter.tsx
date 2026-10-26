import Link from "next/link";
import { cn } from "@/lib/utils";
import { projectFiltersHref, type ProjectListFilters, type ProjectStatusFilter } from "@/lib/projectFilters";

const filters: { value: ProjectStatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "active", label: "진행 중" },
  { value: "completed", label: "완료" },
  { value: "on_hold", label: "보류" },
];

export function ProjectFilter({ filters: selection }: { filters: ProjectListFilters }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {filters.map((f) => (
        <Link
          key={f.value}
          href={projectFiltersHref({ ...selection, status: f.value })}
          prefetch={false}
          scroll={false}
          aria-current={selection.status === f.value ? "page" : undefined}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            selection.status === f.value
              ? "bg-primary text-white"
              : "bg-background border border-border text-foreground hover:border-primary/40 hover:text-primary"
          )}
        >
          {f.label}
        </Link>
      ))}
    </div>
  );
}
