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
import { createProjectFromSpaceRental, updateSpaceRentalStage } from "@/app/actions/inquiries";
import {
  formatSheetDateTime,
  formatCurrentDateTime,
} from "@/lib/inquiries";
import {
  formatSpaceRentalMonth,
  getCurrentSpaceRentalMonth,
  getSpaceRentalFollowupAge,
  shouldHideSpaceRental,
  shiftSpaceRentalMonth,
  SPACE_RENTAL_STAGES,
  summarizeSpaceRentals,
  type SpaceRentalRecord,
  type SpaceRentalStage,
} from "@/lib/spaceRentals";
import { cn } from "@/lib/utils";
import { useVisiblePolling } from "@/lib/useVisiblePolling";

const STAGE_STYLES: Record<SpaceRentalStage, { dot: string; badge: string; header: string }> = {
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
  initialRentals: Array<SpaceRentalRecord & { projectId?: string }>;
  canEdit: boolean;
}

function displayDate(value: string): string {
  return value ? formatSheetDateTime(value) : "-";
}

function displayValue(value: string): string {
  return value || "-";
}

function suggestedProjectName(rental: SpaceRentalRecord): string {
  return rental.eventName || [rental.client || rental.reserverName, rental.eventType].filter(Boolean).join(" ") || "새 프로젝트";
}

export function SpaceRentalKanban({ initialRentals, canEdit }: Props) {
  const [rentals, setRentals] = useState(initialRentals);
  const [now, setNow] = useState(() => new Date());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summaryMonth, setSummaryMonth] = useState(() => getCurrentSpaceRentalMonth());
  const [projectRental, setProjectRental] = useState<SpaceRentalRecord | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [projectSaving, setProjectSaving] = useState(false);

  useVisiblePolling(() => setNow(new Date()), 60_000, { immediate: false });

  const visibleRentals = rentals.filter((rental) => !shouldHideSpaceRental(rental, now));
  const selected = selectedId ? visibleRentals.find((rental) => rental.id === selectedId) ?? null : null;
  const summary = summarizeSpaceRentals(rentals, summaryMonth);
  const currentMonth = getCurrentSpaceRentalMonth(now);
  const summaryTitle = summaryMonth === currentMonth ? "이번 달" : formatSpaceRentalMonth(summaryMonth);

  const setSaving = (id: string, saving: boolean) => {
    setSavingIds((current) => {
      const next = new Set(current);
      if (saving) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const moveRental = async (rental: SpaceRentalRecord, nextStage: SpaceRentalStage) => {
    if (!canEdit || rental.status === nextStage || savingIds.has(rental.id)) return;

    const previous = rental;
    const optimisticTimestamp = formatCurrentDateTime();
    const optimistic = withStageTimestamp({ ...rental, status: nextStage }, nextStage, optimisticTimestamp);
    setRentals((current) => current.map((item) => item.id === rental.id ? optimistic : item));
    setSaving(rental.id, true);

    try {
      const result = await updateSpaceRentalStage(rental.identity, nextStage);
      setRentals((current) => current.map((item) => (
        item.id === rental.id
          ? withStageTimestamp({ ...item, status: nextStage }, nextStage, result.timestamp ?? "")
          : item
      )));
      toast.success(`‘${nextStage}’ 단계로 옮겼습니다.`);
    } catch (error) {
      setRentals((current) => current.map((item) => item.id === rental.id ? previous : item));
      toast.error(error instanceof Error ? `시트 저장 실패: ${error.message}` : "시트 저장 실패");
    } finally {
      setSaving(rental.id, false);
      setDraggedId(null);
    }
  };

  const createProject = async () => {
    if (!projectRental || projectSaving) return;
    setProjectSaving(true);
    try {
      const result = await createProjectFromSpaceRental(projectRental.identity, projectNameDraft);
      setRentals((current) => current.map((item) => item.id === projectRental.id
        ? { ...item, projectName: result.projectName, projectId: result.projectId }
        : item));
      setProjectRental(null);
      toast.success(result.reused ? `기존 프로젝트 ‘${result.projectName}’에 연결했습니다.` : `프로젝트 ‘${result.projectName}’를 만들었습니다.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "프로젝트 생성 실패", { duration: 10000 });
    } finally {
      setProjectSaving(false);
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-border bg-muted/20 p-3 sm:p-4">
        <div className="mb-3 rounded-xl border border-border bg-background px-3 py-2.5 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CalendarDays className="size-4 text-primary" />
              <span>{summaryTitle} 공간대관 요약</span>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="이전 달" onClick={() => setSummaryMonth((current) => shiftSpaceRentalMonth(current, -1))}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="다음 달" onClick={() => setSummaryMonth((current) => shiftSpaceRentalMonth(current, 1))}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground sm:text-sm">
            {summaryTitle} 공간대관 <span className="font-semibold text-foreground">{summary.totalCount}</span>건 · {SPACE_RENTAL_STAGES.map((stage, index) => (
              <span key={stage}>{index > 0 && " · "}{stage} <span className="font-semibold text-foreground">{summary.stageCounts[stage]}</span></span>
            ))}
          </p>
        </div>

        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div className="text-sm text-muted-foreground">전체 <span className="font-semibold text-foreground">{visibleRentals.length}</span>건</div>
          <div className="text-xs text-muted-foreground">{canEdit ? "카드를 끌거나 카드의 단계 변경에서 선택하세요" : "상세 내용을 보려면 카드를 더블클릭하세요"}</div>
        </div>

        {visibleRentals.length === 0 && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            <Inbox className="size-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-foreground">{rentals.length === 0 ? "아직 공간대관 문의가 없습니다." : "현재 표시할 공간대관이 없습니다."}</p>
              <p className="mt-0.5 text-xs">{rentals.length === 0 ? "‘진행 고객’ 탭에 자료가 들어오면 이곳에 카드로 표시됩니다." : "종료 후 2일이 지난 문의는 시트에 남아 있으며 칸반에서만 숨겨집니다."}</p>
            </div>
          </div>
        )}

        <div className="pb-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {SPACE_RENTAL_STAGES.map((stage) => {
              const items = visibleRentals.filter((rental) => rental.status === stage);
              const style = STAGE_STYLES[stage];
              return (
                <section
                  key={stage}
                  className="flex min-h-56 min-w-0 flex-col rounded-xl border border-border bg-background/80 xl:min-h-[28rem]"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const rental = rentals.find((item) => item.id === event.dataTransfer.getData("text/plain"));
                    if (rental) void moveRental(rental, stage);
                  }}
                >
                  <div className={cn("flex items-center justify-between border-b border-border px-3 py-3", style.header)}>
                    <div className="flex items-center gap-2"><span className={cn("size-2 rounded-full", style.dot)} /><h2 className="text-sm font-semibold">{stage}</h2></div>
                    <Badge variant="outline" className={cn("font-normal", style.badge)}>{items.length}</Badge>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-2">
                    {items.length === 0 ? (
                      <div className="flex min-h-32 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-6 text-center text-xs text-muted-foreground dark:bg-muted/5">
                        <Inbox className="size-5 text-muted-foreground/70" /><span>이 단계의 공간대관이 없습니다.</span><span className="text-[11px]">카드를 이곳에 놓거나 단계 변경에서 선택하세요.</span>
                      </div>
                    ) : items.map((rental) => {
                      const age = getSpaceRentalFollowupAge(rental, now);
                      const saving = savingIds.has(rental.id);
                      return (
                        <article
                          key={rental.id}
                          draggable={!saving && canEdit}
                          onDragStart={(event) => { event.dataTransfer.setData("text/plain", rental.id); event.dataTransfer.effectAllowed = "move"; setDraggedId(rental.id); }}
                          onDragEnd={() => setDraggedId(null)}
                          onDoubleClick={() => setSelectedId(rental.id)}
                          className={cn(
                            "touch-pan-y cursor-grab rounded-xl border bg-card p-3 shadow-xs transition hover:-translate-y-0.5 hover:shadow-sm active:cursor-grabbing",
                            age.overdue ? "border-rose-400 bg-rose-50/80 ring-2 ring-rose-200/70 dark:bg-rose-950/20" : "border-border",
                            draggedId === rental.id && "opacity-50",
                            saving && "cursor-wait opacity-70",
                          )}
                          title="더블클릭하여 상세 보기"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold text-foreground">{displayValue(rental.reserverName)}</p>
                              <p className="truncate text-xs text-foreground/80">원청 {displayValue(rental.client)}</p>
                              <p className="truncate text-xs text-foreground/80">{displayValue(rental.eventName)} · {displayValue(rental.eventType)}</p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">접수 {displayDate(rental.receivedAt)}</p>
                            </div>
                            {age.overdue && <span className="shrink-0 rounded-md bg-rose-600 px-1.5 py-1 text-[10px] font-semibold text-white">{age.dayLabel}</span>}
                          </div>
                          <div className="mt-3 space-y-1 border-t border-border/70 pt-2 text-xs text-muted-foreground">
                            <p className="flex items-center gap-1.5 truncate"><Phone className="size-3 shrink-0" />{displayValue(rental.phone)}</p>
                            <p className="flex items-center gap-1.5 truncate"><Mail className="size-3 shrink-0" />{displayValue(rental.email)}</p>
                          </div>
                          {canEdit && (
                            <label className="mt-3 flex items-center gap-2 border-t border-border/70 pt-2 text-[11px] text-muted-foreground" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
                              <span className="shrink-0">단계 변경</span>
                              <select value={rental.status} aria-label={`${displayValue(rental.reserverName)} 단계 변경`} disabled={saving} onChange={(event) => void moveRental(rental, event.target.value as SpaceRentalStage)} className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-background">
                                {SPACE_RENTAL_STAGES.map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            </label>
                          )}
                          {rental.status === "성사" && (
                            <div className="mt-3 border-t border-border/70 pt-2">
                              {rental.projectName ? (
                                <Link href={rental.projectId ? `/projects/${rental.projectId}` : "/projects"} onClick={(event) => event.stopPropagation()} className="block truncate text-xs font-medium text-primary hover:underline">프로젝트 {rental.projectName}</Link>
                              ) : canEdit ? (
                                <Button type="button" variant="outline" size="sm" className="h-7 w-full text-xs" onClick={(event) => { event.stopPropagation(); setProjectRental(rental); setProjectNameDraft(suggestedProjectName(rental)); }} disabled={saving || projectSaving}>프로젝트로 만들기</Button>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{displayValue(selected.reserverName)} 공간대관 상세</DialogTitle>
                <DialogDescription>‘진행 고객’ 탭의 원본 값을 글자 그대로 표시합니다.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DetailField label="구분" value={displayValue(selected.category)} />
                <DetailField label="예약번호" value={displayValue(selected.reservationNumber)} />
                <DetailField label="접수일" value={displayDate(selected.receivedAt)} />
                <DetailField label="예약자명" value={displayValue(selected.reserverName)} icon={<UserRound className="size-3.5" />} />
                <DetailField label="원청" value={displayValue(selected.client)} />
                <DetailField label="대행사" value={displayValue(selected.agency)} />
                <DetailField label="담당자" value={displayValue(selected.assignee)} />
                <DetailField label="연락처" value={displayValue(selected.phone)} icon={<Phone className="size-3.5" />} />
                <DetailField label="이메일" value={displayValue(selected.email)} icon={<Mail className="size-3.5" />} />
                <DetailField label="행사 유형" value={displayValue(selected.eventType)} />
                <DetailField label="행사명" value={displayValue(selected.eventName)} />
                <DetailField label="행사 일정" value={displayValue(selected.schedule)} />
                <DetailField label="세부 시간" value={displayValue(selected.detailTime)} />
                <DetailField label="장소" value={displayValue(selected.venue)} />
                <DetailField label="인원" value={displayValue(selected.attendees)} />
                <DetailField label="서비스 유형" value={displayValue(selected.serviceType)} />
                <DetailField label="예산" value={displayValue(selected.budget)} />
                <DetailField label="정산 (쉐어잇 수수료 제외)" value={displayValue(selected.settlement)} />
                <DetailField label="견적 (고객)" value={displayValue(selected.quote)} />
                <DetailField label="문의 (In/Out)" value={displayValue(selected.direction)} />
                <DetailField label="견적서1" value={displayValue(selected.quoteUrl1)} link={selected.quoteUrl1} />
                <DetailField label="견적서2" value={displayValue(selected.quoteUrl2)} link={selected.quoteUrl2} />
                <DetailField label="1차 연락일시" value={displayDate(selected.contact1At)} />
                <DetailField label="2차 연락일시" value={displayDate(selected.contact2At)} />
                <DetailField label="성사일시" value={displayDate(selected.wonAt)} />
                <DetailField label="종료일시" value={displayDate(selected.closedAt)} />
                <DetailField label="진행 여부" value={displayValue(selected.progress)} />
                <DetailField label="미진행 사유" value={displayValue(selected.notProceedReason)} />
                <div className="rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2">
                  <DetailField label="내용" value={displayValue(selected.content)} multiline />
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2">
                  <DetailField label="상담 내용" value={displayValue(selected.consultation)} multiline />
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2">
                  <DetailField label="고객 답변" value={displayValue(selected.customerReply)} multiline />
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2">
                  <DetailField label="비고" value={displayValue(selected.note)} multiline />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(projectRental)} onOpenChange={(open) => { if (!open && !projectSaving) setProjectRental(null); }}>
        <DialogContent className="sm:max-w-md">
          {projectRental && (
            <>
              <DialogHeader>
                <DialogTitle>프로젝트로 만들기</DialogTitle>
                <DialogDescription>거래처·프로젝트를 만들고 프로젝트 시트에 한 줄을 추가합니다. 이름은 저장 전에 수정할 수 있습니다.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <label htmlFor="space-rental-project-name" className="text-sm font-medium">프로젝트명</label>
                <Input id="space-rental-project-name" value={projectNameDraft} onChange={(event) => setProjectNameDraft(event.target.value)} disabled={projectSaving} autoFocus />
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                행사명: {displayValue(projectRental.eventName)} · 원청: {displayValue(projectRental.client)}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setProjectRental(null)} disabled={projectSaving}>취소</Button>
                <Button type="button" onClick={() => void createProject()} disabled={projectSaving}>
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

function withStageTimestamp(
  rental: SpaceRentalRecord & { projectId?: string },
  stage: SpaceRentalStage,
  timestamp: string,
) {
  if (stage === "1차 연락") return { ...rental, contact1At: timestamp };
  if (stage === "2차 연락") return { ...rental, contact2At: timestamp };
  if (stage === "성사") return { ...rental, wonAt: timestamp };
  if (stage === "종료") return { ...rental, closedAt: timestamp };
  return rental;
}

function DetailField({
  label,
  value,
  icon,
  multiline = false,
  link,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  multiline?: boolean;
  link?: string;
}) {
  return (
    <div className={cn("space-y-1.5", multiline && "rounded-lg border border-border/70 bg-background p-3")}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{icon}{label}</p>
      {link ? <a href={link} target="_blank" rel="noreferrer" className="block truncate text-sm text-primary hover:underline">{value}</a> : <p className={cn("text-sm text-foreground", multiline ? "whitespace-pre-wrap leading-6" : "truncate")}>{value}</p>}
    </div>
  );
}
