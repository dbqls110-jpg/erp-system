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
      return "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400";
    case "green":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "amber":
    case "yellow":
      return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-500";
    case "purple":
      return "border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400";
    case "violet":
      return "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400";
    case "red":
      return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400";
    case "gray":
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

// Usage: <Badge variant="outline" className={toneBadgeClass("amber")}>
