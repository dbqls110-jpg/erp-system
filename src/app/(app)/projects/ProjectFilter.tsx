"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const filters = [
  { value: "all", label: "전체" },
  { value: "active", label: "진행 중" },
  { value: "completed", label: "완료" },
  { value: "on_hold", label: "보류" },
];

export function ProjectFilter({ current }: { current: string }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {filters.map((f) => (
        <Link
          key={f.value}
          href={f.value === "all" ? "/projects" : `/projects?status=${f.value}`}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            current === f.value
              ? "bg-deep-violet text-white"
              : "bg-canvas-white border border-ash-gray text-midnight-charcoal hover:border-deep-violet/40 hover:text-deep-violet"
          )}
        >
          {f.label}
        </Link>
      ))}
    </div>
  );
}
