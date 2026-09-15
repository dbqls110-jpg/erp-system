import * as React from "react"

import { cn } from "@/lib/utils"

interface EmptyStateProps extends React.ComponentProps<"div"> {
  icon?: React.ReactNode
}

function EmptyState({ icon, children, className, ...props }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground",
        className,
      )}
      {...props}
    >
      {icon}
      <div>{children}</div>
    </div>
  )
}

export { EmptyState }
