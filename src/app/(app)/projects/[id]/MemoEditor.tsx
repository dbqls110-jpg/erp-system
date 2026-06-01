"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateProjectMemo } from "@/app/actions/project";
import { toast } from "sonner";
import { Pencil, Check, X } from "lucide-react";

export function MemoEditor({ projectId, memo }: { projectId: string; memo: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(memo ?? "");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateProjectMemo(projectId, value);
      toast.success("메모가 저장됐습니다.");
      setEditing(false);
    } catch {
      toast.error("저장 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setValue(memo ?? "");
    setEditing(false);
  };

  return (
    <div className="space-y-2">
      {editing ? (
        <>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            className="text-sm"
            placeholder="메모를 입력하세요"
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={loading} className="gap-1 bg-dark-onyx text-white" style={{ borderRadius: "9px" }}>
              <Check size={13} /> {loading ? "저장 중..." : "저장"}
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancel} className="gap-1">
              <X size={13} /> 취소
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-midnight-charcoal whitespace-pre-wrap flex-1">
            {value || <span className="text-smoke-gray">메모 없음</span>}
          </p>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="gap-1 shrink-0 h-7 px-2">
            <Pencil size={13} /> 편집
          </Button>
        </div>
      )}
    </div>
  );
}
