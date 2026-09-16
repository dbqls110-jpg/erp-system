import * as React from "react"

import { cn } from "@/lib/utils"

function PageIntro({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="page-intro" className={cn("text-[13px] text-muted-foreground", className)} {...props} />
}

export { PageIntro }
