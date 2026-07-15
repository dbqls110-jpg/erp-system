"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface AgentStatusBadgeProps {
  agentType: string;
  className?: string;
}

interface StatusData {
  online: boolean;
  lastSeenAt: string | null;
  version?: string | null;
}

export function AgentStatusBadge({ agentType, className }: AgentStatusBadgeProps) {
  const [status, setStatus] = useState<StatusData | null>(null);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        const res = await fetch(`/api/agent/status?agentType=${encodeURIComponent(agentType)}`);
        if (res.ok && alive) {
          setStatus(await res.json());
        }
      } catch {}
    };

    check();
    const id = setInterval(check, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [agentType]);

  if (!status) return null;

  const label = agentType === "hermes" ? "Hermes" : agentType === "marketer" ? "마케터" : agentType;

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", className)}>
      <span
        className={cn(
          "w-2 h-2 rounded-full inline-block",
          status.online ? "bg-green-400 animate-pulse" : "bg-gray-400"
        )}
      />
      <span className={cn("font-medium", status.online ? "text-green-600 dark:text-green-400" : "text-gray-400")}>
        {label} {status.online ? "온라인" : "오프라인"}
      </span>
    </span>
  );
}
