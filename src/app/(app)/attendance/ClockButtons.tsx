"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { manualClockIn, manualClockOut } from "@/app/actions/attendance";
import { toast } from "sonner";
import { LogIn, LogOut } from "lucide-react";

interface Props {
  hasClockIn: boolean;
  hasClockOut: boolean;
}

export function ClockButtons({ hasClockIn, hasClockOut }: Props) {
  const [loading, setLoading] = useState<"in" | "out" | null>(null);

  const handleClockIn = async () => {
    setLoading("in");
    try {
      await manualClockIn();
      toast.success("출근이 기록됐습니다.");
    } catch {
      toast.error("기록 실패");
    } finally {
      setLoading(null);
    }
  };

  const handleClockOut = async () => {
    setLoading("out");
    try {
      await manualClockOut();
      toast.success("퇴근이 기록됐습니다.");
    } catch {
      toast.error("기록 실패");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex gap-3">
      <Button
        onClick={handleClockIn}
        disabled={hasClockIn || loading === "in"}
        className="gap-2 bg-deep-violet text-white hover:bg-rich-plum border-0 disabled:opacity-40"
        style={{ borderRadius: "9px" }}
      >
        <LogIn size={16} />
        {loading === "in" ? "처리 중..." : hasClockIn ? "출근 완료" : "출근"}
      </Button>
      <Button
        onClick={handleClockOut}
        disabled={!hasClockIn || hasClockOut || loading === "out"}
        variant="outline"
        className="gap-2 disabled:opacity-40"
        style={{ borderRadius: "9px" }}
      >
        <LogOut size={16} />
        {loading === "out" ? "처리 중..." : hasClockOut ? "퇴근 완료" : "퇴근"}
      </Button>
    </div>
  );
}
