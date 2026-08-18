"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVisiblePolling } from "@/lib/useVisiblePolling";
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

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const check = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/status?agentType=${encodeURIComponent(agentType)}`);
      if (res.ok && aliveRef.current) {
        setStatus(await res.json());
      }
    } catch {}
  }, [agentType]);

  // 마운트/agentType 변경 시 즉시 1회 + 탭이 보이는 동안에만 30초 폴링
  // (백그라운드 탭이 DB를 깨우지 않도록)
  useVisiblePolling(check, 30_000);

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
