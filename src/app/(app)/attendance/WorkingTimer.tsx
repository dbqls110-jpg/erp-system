"use client";

import { useState, useEffect } from "react";

export function WorkingTimer({ clockInIso }: { clockInIso: string }) {
  const [text, setText] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = Date.now() - new Date(clockInIso).getTime();
      if (diff <= 0) { setText("0시간 0분"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setText(`${h}시간 ${m}분 근무 중`);
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [clockInIso]);

  if (!text) return null;
  return <span className="text-xs text-electric-blue font-medium">{text}</span>;
}
