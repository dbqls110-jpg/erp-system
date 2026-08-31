"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  fieldLabel,
  validateProposal,
  type SheetCreateContent,
  type Proposal,
} from "@/lib/assistantProposal";
import { sheetFolderPath } from "@/lib/sheetLimits";

/**
 * 비서가 내놓은 변경 제안을 확인 카드로 보여준다.
 *
 * AI 는 DB 에 쓰지 않는다. 무엇을 어떻게 바꿀지 여기 적어 보이고, 사람이 저장을
 * 누를 때 서버가 쓴다. "70만원" 을 "700만원" 으로 잘못 읽어도 사람이 보고 막을 수
 * 있는 자리가 필요하다.
 *
 * 값을 여기서 검증해 보여주기도 한다. 서버가 어차피 다시 검사하지만, 저장을 누른
 * 뒤에야 "이 칸은 못 바꿉니다" 라고 알려 주면 늦다.
 */

function displayValue(value: unknown): string {
  if (value === null) return "(지움)";
  if (typeof value === "number") return value.toLocaleString();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function SheetPreview({ data }: { data: Record<string, string[][]> }) {
  const entries = Object.entries(data).filter(([, rows]) => rows.length > 0);
  if (entries.length === 0) {
    return <p className="mt-2 text-[11px] text-muted-foreground">미리 볼 표 내용이 없습니다.</p>;
  }

  return (
    <div className="mt-2 space-y-2">
      {entries.map(([tabName, rows]) => {
        const previewRows = rows.slice(0, 5);
        const columnCount = Math.max(1, ...previewRows.map((row) => row.length));
        return (
          <div key={tabName} className="overflow-hidden rounded-lg border border-border">
            <p className="border-b border-border bg-muted/50 px-2 py-1 text-[11px] font-medium text-foreground">
              {tabName}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <tbody>
                  {previewRows.map((row, rowIndex) => (
                    <tr key={rowIndex} className={rowIndex === 0 ? "bg-muted/30" : undefined}>
                      {Array.from({ length: columnCount }, (_, columnIndex) => {
                        const Cell = rowIndex === 0 ? "th" : "td";
                        return (
                          <Cell
                            key={columnIndex}
                            className="max-w-48 border-r border-border px-2 py-1 align-top last:border-r-0"
                          >
                            {row[columnIndex] ?? ""}
                          </Cell>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProposalCard({
  proposal,
  index,
  jobId,
  onApplied,
}: {
  proposal: Proposal;
  /** 같은 답변 안에서 몇 번째 제안인지. 서버가 답변을 다시 읽어 대조할 때 쓴다. */
  index: number;
  jobId: string;
  onApplied?: () => void;
}) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "cancelled">("idle");
  const [error, setError] = useState<string | null>(null);

  const { accepted, rejected } = validateProposal(proposal);
  const isSheetCreate = proposal.target === "sheet_create";
  const sheet = isSheetCreate ? (accepted as unknown as Partial<SheetCreateContent>) : null;
  const sheetTabs = sheet && Array.isArray(sheet.tabs) ? sheet.tabs : [];
  const sheetData = sheet && sheet.data && typeof sheet.data === "object" ? sheet.data : {};
  const sheetRowCount = Object.values(sheetData).reduce(
    (count, rows) => count + (Array.isArray(rows) ? rows.length : 0),
    0,
  );
  const sheetCellCount = Object.values(sheetData).reduce(
    (count, rows) => count + (Array.isArray(rows) ? rows.reduce((sum, row) => sum + row.length, 0) : 0),
    0,
  );
  const sheetColumnCount = Object.values(sheetData).reduce(
    (count, rows) => Math.max(count, ...(Array.isArray(rows) ? rows.map((row) => row.length) : [])),
    0,
  );
  const nothingToApply = isSheetCreate
    ? rejected.length > 0 || typeof sheet?.title !== "string"
    : Object.keys(accepted).length === 0;
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  async function apply() {
    setState("saving");
    setError(null);
    setSheetUrl(null);
    try {
      const res = await fetch("/api/assistant/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, index }),
      });
      const data = (await res.json()) as { error?: string; name?: string; url?: string };
      if (!res.ok) {
        setError(data.error ?? "저장하지 못했습니다.");
        setState("idle");
        return;
      }
      setState("done");
      setSheetUrl(data.url ?? null);
      toast.success(isSheetCreate ? "구글 시트를 만들었습니다." : `${data.name ?? "자료"}에 반영했습니다.`);
      onApplied?.();
    } catch {
      setError("저장하지 못했습니다.");
      setState("idle");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-xs font-medium text-foreground">
        {isSheetCreate ? (typeof sheet?.title === "string" ? sheet.title : "새 시트") : proposal.label ?? proposal.id}
        <span className="ml-1.5 font-normal text-muted-foreground">
          {proposal.target === "venue"
            ? "공간"
            : proposal.target === "partner"
              ? "파트너"
              : proposal.target === "project"
                ? "프로젝트"
                : proposal.target === "drive_file"
                  ? "Drive 파일"
                  : "구글 시트"}
        </span>
      </p>
      {proposal.reason && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{proposal.reason}</p>
      )}

      {isSheetCreate ? (
        <>
          <dl className="mt-2 space-y-1 text-xs">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">저장 폴더</dt>
              <dd className="text-foreground">
                {sheetFolderPath(typeof sheet?.folderName === "string" ? sheet.folderName : undefined)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">탭</dt>
              <dd className="text-foreground">{sheetTabs.join(", ") || "Sheet1"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">크기</dt>
              <dd className="text-foreground">
                총 {sheetRowCount}행 {sheetColumnCount}열 · {sheetCellCount}칸
              </dd>
            </div>
          </dl>
          <SheetPreview data={sheetData as Record<string, string[][]>} />
        </>
      ) : (
        <dl className="mt-2 space-y-1">
          {Object.entries(accepted).map(([field, value]) => (
            <div key={field} className="flex gap-2 text-xs">
              <dt className="w-20 shrink-0 text-muted-foreground">
                {fieldLabel(proposal.target, field)}
              </dt>
              <dd className="text-foreground">{displayValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {rejected.length > 0 && (
        // 버린 칸을 감추면 "왜 이건 안 들어갔지"를 알 수 없다.
        <ul className="mt-2 space-y-0.5">
          {rejected.map((r) => (
            <li key={r.field} className="text-[11px] text-muted-foreground">
              {fieldLabel(proposal.target, r.field)} — {r.reason}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}

      {state === "done" ? (
        <div className="mt-2 text-[11px] text-muted-foreground">
          <p className="flex items-center gap-1">
            <Check className="size-3" /> {isSheetCreate ? "시트를 만들었습니다" : "반영했습니다"}
          </p>
          {sheetUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-primary underline underline-offset-2"
            >
              구글 시트 열기
            </a>
          )}
        </div>
      ) : state === "cancelled" ? (
        <p className="mt-2 text-[11px] text-muted-foreground">취소했습니다</p>
      ) : (
        <div className="mt-2.5 flex gap-1.5">
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={apply}
            disabled={state === "saving" || nothingToApply}
            title={nothingToApply ? "적용할 수 있는 항목이 없습니다" : undefined}
          >
            {state === "saving" ? (isSheetCreate ? "시트 만드는 중…" : "저장 중…") : isSheetCreate ? "시트 만들기" : "저장"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setState("cancelled")}
            disabled={state === "saving"}
          >
            <X className="size-3" />
            취소
          </Button>
        </div>
      )}
    </div>
  );
}
