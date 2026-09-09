"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Inbox, Mail, Phone, UserRound } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProjectFromInquiry, updateInquiryMemo, updateInquiryStage } from "@/app/actions/inquiries";
import {
  formatInquiryMonth,
  formatCurrentDateTime,
  formatSheetDateTime,
  getCurrentInquiryMonth,
  getFollowupAge,
  getInquiryClosePoint,
  INQUIRY_STAGES,
  shouldHideInquiry,
  shiftInquiryMonth,
  summarizeInquiries,
  type InquiryRecord,
  type InquiryStage,
} from "@/lib/inquiries";
import { cn } from "@/lib/utils";
import { useVisiblePolling } from "@/lib/useVisiblePolling";

const STAGE_STYLES: Record<InquiryStage, { dot: string; badge: string; header: string }> = {
  문의: {
    dot: "bg-slate-400 dark:bg-slate-500",
    badge: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300",
    header: "bg-slate-50/70 dark:bg-slate-950/30",
  },
  "1차 연락": {
    dot: "bg-sky-500 dark:bg-sky-400",
    badge: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
    header: "bg-sky-50/70 dark:bg-sky-950/20",
  },
  "2차 연락": {
    dot: "bg-amber-500 dark:bg-amber-400",
    badge: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    header: "bg-amber-50/70 dark:bg-amber-950/20",
  },
  성사: {
    dot: "bg-violet-500 dark:bg-violet-400",
    badge: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
    header: "bg-violet-50/70 dark:bg-violet-950/20",
  },
  종료: {
    dot: "bg-emerald-500 dark:bg-emerald-400",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    header: "bg-emerald-50/70 dark:bg-emerald-950/20",
  },
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

function suggestedProjectName(inquiry: InquiryRecord): string {
  return [inquiry.name, inquiry.rentalType].filter(Boolean).join(" ") || "새 프로젝트";
}

export function InquiriesKanban({ initialInquiries, canEdit }: Props) {
  const [inquiries, setInquiries] = useState(initialInquiries);
  const [now, setNow] = useState(() => new Date());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memoDraft, setMemoDraft] = useState("");
  const [memoSaving, setMemoSaving] = useState(false);
  const [summaryMonth, setSummaryMonth] = useState(() => getCurrentInquiryMonth());
  const [projectInquiry, setProjectInquiry] = useState<InquiryRecord | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [projectSaving, setProjectSaving] = useState(false);

  useVisiblePolling(() => setNow(new Date()), 60_000, { immediate: false });

  const visibleInquiries = inquiries.filter((inquiry) => !shouldHideInquiry(inquiry, now));
  const selected = selectedId ? visibleInquiries.find((inquiry) => inquiry.id === selectedId) ?? null : null;
  const summary = summarizeInquiries(inquiries, summaryMonth);
  const currentMonth = getCurrentInquiryMonth(now);
  const summaryTitle = summaryMonth === currentMonth ? "이번 달" : formatInquiryMonth(summaryMonth);

  const openDetail = (inquiry: InquiryRecord) => {
    setSelectedId(inquiry.id);
    setMemoDraft(inquiry.memo);
  };

  const openProjectDialog = (inquiry: InquiryRecord) => {
    setProjectInquiry(inquiry);
    setProjectNameDraft(suggestedProjectName(inquiry));
  };

  const createProject = async () => {
    if (!projectInquiry || projectSaving) return;
    setProjectSaving(true);
    try {
      const result = await createProjectFromInquiry(projectInquiry.identity, projectNameDraft);
      setInquiries((current) => current.map((item) => item.id === projectInquiry.id
        ? { ...item, projectName: result.projectName, projectId: result.projectId }
        : item));
      setProjectInquiry(null);
      toast.success(result.reused ? `기존 프로젝트 ‘${result.projectName}’에 연결했습니다.` : `프로젝트 ‘${result.projectName}’를 만들었습니다.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "프로젝트 생성 실패", { duration: 10000 });
    } finally {
      setProjectSaving(false);
    }
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
      ...(nextStage === "종료" ? { closedAt: optimisticTimestamp } : {}),
      ...(nextStage === "성사" ? { wonAt: optimisticTimestamp } : {}),
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
          ...(nextStage === "종료" ? { closedAt: result.timestamp } : {}),
          ...(nextStage === "성사" ? { wonAt: result.timestamp } : {}),
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
        <div className="mb-3 rounded-xl border border-border bg-background px-3 py-2.5 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CalendarDays className="size-4 text-primary" />
              <span>{summaryTitle} 문의 요약</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="이전 달"
                onClick={() => setSummaryMonth((current) => shiftInquiryMonth(current, -1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="다음 달"
                onClick={() => setSummaryMonth((current) => shiftInquiryMonth(current, 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground sm:text-sm">
            <p>
              {summaryTitle} 문의 <span className="font-semibold text-foreground">{summary.inquiryCount}</span>건 · 1차 <span className="font-semibold text-foreground">{summary.contact1Count}</span> · 2차 <span className="font-semibold text-foreground">{summary.contact2Count}</span> · 성사 <span className="font-semibold text-foreground">{summary.wonCount}</span>
            </p>
            <p>
              이탈&nbsp; 문의 <span className="font-semibold text-foreground">{summary.dropOff["연락 전"]}</span> · 1차 <span className="font-semibold text-foreground">{summary.dropOff["1차"]}</span> · 2차 <span className="font-semibold text-foreground">{summary.dropOff["2차"]}</span>
            </p>
          </div>
        </div>
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div className="text-sm text-muted-foreground">
            전체 <span className="font-semibold text-foreground">{visibleInquiries.length}</span>건
          </div>
          <div className="text-xs text-muted-foreground">
            {canEdit ? "카드를 끌거나 카드의 단계 변경에서 선택하세요" : "상세 내용을 보려면 카드를 더블클릭하세요"}
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
                  : "종료 후 2일이 지난 문의는 시트에 남아 있으며 칸반에서만 숨겨집니다."}
              </p>
            </div>
          </div>
        )}

        <div className="pb-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {INQUIRY_STAGES.map((stage) => {
              const items = visibleInquiries.filter((inquiry) => inquiry.status === stage);
              const style = STAGE_STYLES[stage];
              return (
                <section
                  key={stage}
                  className="flex min-h-56 min-w-0 flex-col rounded-xl border border-border bg-background/80 xl:min-h-[28rem]"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const inquiry = inquiries.find((item) => item.id === event.dataTransfer.getData("text/plain"));
                    if (inquiry) void moveInquiry(inquiry, stage);
                  }}
                >
                  <div className={cn("flex items-center justify-between border-b border-border px-3 py-3", style.header)}>
                    <div className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-full", style.dot)} />
                      <h2 className="text-sm font-semibold">{stage}</h2>
                    </div>
                    <Badge variant="outline" className={cn("font-normal", style.badge)}>{items.length}</Badge>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-2">
                    {items.length === 0 ? (
                      <div className="flex min-h-32 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-6 text-center text-xs text-muted-foreground dark:bg-muted/5">
                        <Inbox className="size-5 text-muted-foreground/70" />
                        <span>이 단계의 문의가 없습니다.</span>
                        <span className="text-[11px]">카드를 이곳에 놓거나 단계 변경에서 선택하세요.</span>
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
                            "touch-pan-y cursor-grab rounded-xl border bg-card p-3 shadow-xs transition hover:-translate-y-0.5 hover:shadow-sm active:cursor-grabbing",
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
                              <p className="truncate text-base font-semibold text-foreground">{displayValue(inquiry.name)}</p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">접수 {displayDate(inquiry.submittedAt)}</p>
                            </div>
                            {age.overdue && (
                              <span className="shrink-0 rounded-md bg-rose-600 px-1.5 py-1 text-[10px] font-semibold text-white">
                                {age.dayLabel}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                            {displayValue(inquiry.content)}
                          </p>
                          {inquiry.status === "종료" && (
                            <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                              {getInquiryClosePoint(inquiry)}에서 종료
                            </p>
                          )}
                          <div className="mt-3 space-y-1 border-t border-border/70 pt-2 text-xs text-muted-foreground">
                            <p className="flex items-center gap-1.5 truncate"><Phone className="size-3 shrink-0" />{displayValue(inquiry.phone)}</p>
                            <p className="flex items-center gap-1.5 truncate"><Mail className="size-3 shrink-0" />{displayValue(inquiry.email)}</p>
                          </div>
                          {canEdit && (
                            <label
                              className="mt-3 flex items-center gap-2 border-t border-border/70 pt-2 text-[11px] text-muted-foreground"
                              onClick={(event) => event.stopPropagation()}
                              onDoubleClick={(event) => event.stopPropagation()}
                            >
                              <span className="shrink-0">단계 변경</span>
                              <select
                                value={inquiry.status}
                                aria-label={`${displayValue(inquiry.name)} 단계 변경`}
                                disabled={saving}
                                onChange={(event) => void moveInquiry(inquiry, event.target.value as InquiryStage)}
                                className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-background"
                              >
                                {INQUIRY_STAGES.map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            </label>
                          )}
                          {inquiry.status === "성사" && (
                            <div className="mt-3 border-t border-border/70 pt-2">
                              {inquiry.projectName ? (
                                <Link
                                  href={inquiry.projectId ? `/projects/${inquiry.projectId}` : "/projects"}
                                  onClick={(event) => event.stopPropagation()}
                                  className="block truncate text-xs font-medium text-primary hover:underline"
                                  title={inquiry.projectId ? `프로젝트 ${inquiry.projectName}로 이동` : "프로젝트 목록에서 확인"}
                                >
                                  프로젝트 {inquiry.projectName}
                                </Link>
                              ) : canEdit ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-full text-xs"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openProjectDialog(inquiry);
                                  }}
                                  disabled={saving || projectSaving}
                                >
                                  프로젝트로 만들기
                                </Button>
                              ) : null}
                            </div>
                          )}
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
                <DetailField label="성사일시" value={displayDate(selected.wonAt)} />
                <DetailField label="종료일시" value={displayDate(selected.closedAt)} />
                {selected.projectName && (
                  <div className="sm:col-span-2">
                    {selected.projectId ? (
                      <Link href={`/projects/${selected.projectId}`} className="text-sm font-medium text-primary hover:underline">
                        프로젝트 {selected.projectName}
                      </Link>
                    ) : (
                      <p className="text-sm text-muted-foreground">프로젝트 {selected.projectName}</p>
                    )}
                  </div>
                )}
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

      <Dialog
        open={Boolean(projectInquiry)}
        onOpenChange={(open) => {
          if (!open && !projectSaving) setProjectInquiry(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {projectInquiry && (
            <>
              <DialogHeader>
                <DialogTitle>프로젝트로 만들기</DialogTitle>
                <DialogDescription>
                  거래처·프로젝트를 만들고 프로젝트 시트에 한 줄을 추가합니다. 이름은 저장 전에 수정할 수 있습니다.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="inquiry-project-name">프로젝트명</Label>
                <Input
                  id="inquiry-project-name"
                  value={projectNameDraft}
                  onChange={(event) => setProjectNameDraft(event.target.value)}
                  disabled={projectSaving}
                  autoFocus
                />
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                대관 유형: {displayValue(projectInquiry.rentalType)} · 희망 지역: {displayValue(projectInquiry.desiredArea)}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setProjectInquiry(null)} disabled={projectSaving}>
                  취소
                </Button>
                <Button type="button" onClick={() => void createProject()} disabled={projectSaving || !projectNameDraft.trim()}>
                  {projectSaving ? "생성 중..." : "프로젝트 만들기"}
                </Button>
              </DialogFooter>
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
