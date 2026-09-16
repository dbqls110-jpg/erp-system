import * as React from "react"

import { cn } from "@/lib/utils"

interface SummaryRowProps extends React.ComponentProps<"div"> {
  label: React.ReactNode
  value: React.ReactNode
  valueClassName?: string
}

function SummaryRow({ label, value, valueClassName, className, ...props }: SummaryRowProps) {
  return (
    <div
      data-slot="summary-row"
      className={cn("flex items-center justify-between gap-4 border-t border-border px-4 py-3", className)}
      {...props}
    >
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span
        className={cn("text-[14px] font-bold tabular-nums", valueClassName)}
        style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}
      >
        {value}
      </span>
    </div>
  )
}

export { SummaryRow }
