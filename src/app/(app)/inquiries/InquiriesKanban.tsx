"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Inbox, Mail, Phone, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { updateInquiryMemo, updateInquiryStage } from "@/app/actions/inquiries";
import {
  formatCurrentDateTime,
  formatSheetDateTime,
  getFollowupAge,
  INQUIRY_STAGES,
  shouldHideInquiry,
  type InquiryRecord,
  type InquiryStage,
} from "@/lib/inquiries";
import { cn } from "@/lib/utils";
import { useVisiblePolling } from "@/lib/useVisiblePolling";

const STAGE_STYLES: Record<InquiryStage, { dot: string; badge: string }> = {
  문의: { dot: "bg-slate-400", badge: "border-slate-200 bg-slate-50 text-slate-700" },
  "1차 연락": { dot: "bg-sky-500", badge: "border-sky-200 bg-sky-50 text-sky-700" },
  "2차 연락": { dot: "bg-amber-500", badge: "border-amber-200 bg-amber-50 text-amber-700" },
  "3차 연락": { dot: "bg-orange-500", badge: "border-orange-200 bg-orange-50 text-orange-700" },
  종료: { dot: "bg-emerald-500", badge: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

interface Props {
  initialInquiries: InquiryRecord[];
  canEdit: boolean;
}

function displayDate(value: string): string {
  return value ? formatSheetDateTime(value) : "-";
}

function displayValue(value: string): string {
  return value || "-";
}

export function InquiriesKanban({ initialInquiries, canEdit }: Props) {
  const [inquiries, setInquiries] = useState(initialInquiries);
  const [now, setNow] = useState(() => new Date());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memoDraft, setMemoDraft] = useState("");
  const [memoSaving, setMemoSaving] = useState(false);

  useVisiblePolling(() => setNow(new Date()), 60_000, { immediate: false });

  const visibleInquiries = inquiries.filter((inquiry) => !shouldHideInquiry(inquiry, now));
  const selected = selectedId ? visibleInquiries.find((inquiry) => inquiry.id === selectedId) ?? null : null;

  const openDetail = (inquiry: InquiryRecord) => {
    setSelectedId(inquiry.id);
    setMemoDraft(inquiry.memo);
  };

  const setSaving = (id: string, saving: boolean) => {
    setSavingIds((current) => {
      const next = new Set(current);
      if (saving) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const moveInquiry = async (inquiry: InquiryRecord, nextStage: InquiryStage) => {
    if (!canEdit || inquiry.status === nextStage || savingIds.has(inquiry.id)) return;

    const previous = inquiry;
    const optimisticTimestamp = formatCurrentDateTime();
    const optimistic = {
      ...inquiry,
      status: nextStage,
      ...(nextStage === "1차 연락" ? { contact1At: optimisticTimestamp } : {}),
      ...(nextStage === "2차 연락" ? { contact2At: optimisticTimestamp } : {}),
      ...(nextStage === "3차 연락" ? { contact3At: optimisticTimestamp } : {}),
      ...(nextStage === "종료" ? { closedAt: optimisticTimestamp } : {}),
    };
    setInquiries((current) => current.map((item) => item.id === inquiry.id ? optimistic : item));
    setSaving(inquiry.id, true);

    try {
      const result = await updateInquiryStage(inquiry.identity, nextStage);
      setInquiries((current) => current.map((item) => {
        if (item.id !== inquiry.id || !result.timestamp) return item;
        return {
          ...item,
          ...(nextStage === "1차 연락" ? { contact1At: result.timestamp } : {}),
          ...(nextStage === "2차 연락" ? { contact2At: result.timestamp } : {}),
          ...(nextStage === "3차 연락" ? { contact3At: result.timestamp } : {}),
          ...(nextStage === "종료" ? { closedAt: result.timestamp } : {}),
        };
      }));
      toast.success(`‘${nextStage}’ 단계로 옮겼습니다.`);
    } catch (error) {
      setInquiries((current) => current.map((item) => item.id === inquiry.id ? previous : item));
      toast.error(error instanceof Error ? `시트 저장 실패: ${error.message}` : "시트 저장 실패");
    } finally {
      setSaving(inquiry.id, false);
      setDraggedId(null);
    }
  };

  const saveMemo = async () => {
    if (!selected) return;
    setMemoSaving(true);
    try {
      const result = await updateInquiryMemo(selected.identity, memoDraft);
      setInquiries((current) => current.map((item) => item.id === selected.id ? { ...item, memo: result.memo } : item));
      setMemoDraft(result.memo);
      toast.success("메모를 저장했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? `메모 저장 실패: ${error.message}` : "메모 저장 실패");
    } finally {
      setMemoSaving(false);
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-border bg-muted/20 p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div className="text-sm text-muted-foreground">
            전체 <span className="font-semibold text-foreground">{visibleInquiries.length}</span>건
          </div>
          <div className="text-xs text-muted-foreground">
            {canEdit ? "카드를 끌어 단계에 놓으세요" : "상세 내용을 보려면 카드를 더블클릭하세요"}
          </div>
        </div>

        {visibleInquiries.length === 0 && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            <Inbox className="size-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-foreground">
                {inquiries.length === 0 ? "아직 접수된 문의가 없습니다." : "현재 표시할 문의가 없습니다."}
              </p>
              <p className="mt-0.5 text-xs">
                {inquiries.length === 0
                  ? "홈페이지 문의가 ‘문의 접수’ 시트에 들어오면 이곳에 카드로 표시됩니다."
                  : "종료 후 3일이 지난 문의는 시트에 남아 있으며 칸반에서만 숨겨집니다."}
              </p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1180px] grid-cols-5 gap-3">
            {INQUIRY_STAGES.map((stage) => {
              const items = visibleInquiries.filter((inquiry) => inquiry.status === stage);
              const style = STAGE_STYLES[stage];
              return (
                <section
                  key={stage}
                  className="flex min-h-[28rem] min-w-0 flex-col rounded-xl border border-border bg-background/80"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const inquiry = inquiries.find((item) => item.id === event.dataTransfer.getData("text/plain"));
                    if (inquiry) void moveInquiry(inquiry, stage);
                  }}
                >
                  <div className="flex items-center justify-between border-b border-border px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-full", style.dot)} />
                      <h2 className="text-sm font-semibold">{stage}</h2>
                    </div>
                    <Badge variant="outline" className={cn("font-normal", style.badge)}>{items.length}</Badge>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-2">
                    {items.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 px-3 text-center text-xs text-muted-foreground">
                        이 단계의 문의가 없습니다.
                      </div>
                    ) : items.map((inquiry) => {
                      const age = getFollowupAge(inquiry, now);
                      const saving = savingIds.has(inquiry.id);
                      return (
                        <article
                          key={inquiry.id}
                          draggable={!saving && canEdit}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", inquiry.id);
                            event.dataTransfer.effectAllowed = "move";
                            setDraggedId(inquiry.id);
                          }}
                          onDragEnd={() => setDraggedId(null)}
                          onDoubleClick={() => openDetail(inquiry)}
                          className={cn(
                            "cursor-grab rounded-xl border bg-card p-3 shadow-xs transition hover:-translate-y-0.5 hover:shadow-sm active:cursor-grabbing",
                            age.overdue
                              ? "border-rose-400 bg-rose-50/80 ring-2 ring-rose-200/70 dark:bg-rose-950/20"
                              : "border-border",
                            draggedId === inquiry.id && "opacity-50",
                            saving && "cursor-wait opacity-70",
                          )}
                          title="더블클릭하여 상세 보기"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">{displayValue(inquiry.name)}</p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">접수 {displayDate(inquiry.submittedAt)}</p>
                            </div>
                            {age.overdue && (
                              <span className="shrink-0 rounded-md bg-rose-600 px-1.5 py-1 text-[10px] font-semibold text-white">
                                {age.dayLabel}
                              </span>
                            )}
                          </div>
                          <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-foreground/85">
                            {displayValue(inquiry.content)}
                          </p>
                          <div className="mt-3 space-y-1 border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
                            <p className="flex items-center gap-1.5 truncate"><Phone className="size-3 shrink-0" />{displayValue(inquiry.phone)}</p>
                            <p className="flex items-center gap-1.5 truncate"><Mail className="size-3 shrink-0" />{displayValue(inquiry.email)}</p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{displayValue(selected.name)} 문의 상세</DialogTitle>
                <DialogDescription>시트의 문의 접수 행을 기준으로 표시합니다.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DetailField label="접수일시" value={displayDate(selected.submittedAt)} />
                <DetailField label="처리 상태" value={selected.status} />
                <DetailField label="이름" value={displayValue(selected.name)} icon={<UserRound className="size-3.5" />} />
                <DetailField label="연락처" value={displayValue(selected.phone)} icon={<Phone className="size-3.5" />} />
                <DetailField label="이메일" value={displayValue(selected.email)} icon={<Mail className="size-3.5" />} />
                <DetailField label="대관 유형" value={displayValue(selected.rentalType)} />
                <DetailField label="희망 지역" value={displayValue(selected.desiredArea)} />
                <DetailField label="담당자" value={displayValue(selected.assignee)} />
                <DetailField label="1차 연락일시" value={displayDate(selected.contact1At)} />
                <DetailField label="2차 연락일시" value={displayDate(selected.contact2At)} />
                <DetailField label="3차 연락일시" value={displayDate(selected.contact3At)} />
                <DetailField label="종료일시" value={displayDate(selected.closedAt)} />
                <div className="sm:col-span-2">
                  <DetailField label="문의 내용" value={displayValue(selected.content)} multiline />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="inquiry-memo" className="text-xs font-medium text-muted-foreground">메모</label>
                  <Textarea id="inquiry-memo" value={memoDraft} onChange={(event) => setMemoDraft(event.target.value)} rows={4} placeholder="담당자가 남길 메모" readOnly={!canEdit} />
                </div>
              </div>
              {canEdit && (
                <DialogFooter>
                  <Button type="button" onClick={() => void saveMemo()} disabled={memoSaving}>
                    {memoSaving ? "저장 중..." : "메모 저장"}
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailField({
  label,
  value,
  icon,
  multiline = false,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  multiline?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", multiline && "rounded-lg border border-border bg-muted/30 p-3")}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{icon}{label}</p>
      <p className={cn("text-sm text-foreground", multiline ? "whitespace-pre-wrap leading-6" : "truncate")}>{value}</p>
    </div>
  );
}
