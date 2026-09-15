export type BadgeTone =
  | "gray"
  | "blue"
  | "green"
  | "amber"
  | "yellow"
  | "purple"
  | "violet"
  | "red";

export function toneBadgeClass(tone: BadgeTone): string {
  switch (tone) {
    case "blue":
      return "bg-[#dbeafe] text-[#1d4ed8] dark:bg-blue-950/60 dark:text-blue-300";
    case "green":
      return "bg-[#dcfce7] text-[#15803d] dark:bg-emerald-950/60 dark:text-emerald-300";
    case "amber":
    case "yellow":
      return "bg-[#fef3c7] text-[#b45309] dark:bg-amber-950/60 dark:text-amber-300";
    case "purple":
      return "bg-[#ede9fe] text-[#6d28d9] dark:bg-violet-950/60 dark:text-violet-300";
    case "violet":
      return "bg-[#ede9fe] text-[#6d28d9] dark:bg-violet-950/60 dark:text-violet-300";
    case "red":
      return "bg-[#fee2e2] text-[#b91c1c] dark:bg-red-950/60 dark:text-red-300";
    case "gray":
    default:
      return "bg-[#e9ebf0] text-[#4b5563] dark:bg-muted/50 dark:text-muted-foreground";
  }
}

// Usage: <Badge variant="outline" className={toneBadgeClass("amber")}>
