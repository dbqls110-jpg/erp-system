"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Inbox, Mail, Phone, UserRound } from "lucide-react";
import { updateSpaceRegistrationMemo, updateSpaceRegistrationStage } from "@/app/actions/inquiries";
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
import {
  type SpaceRegistrationRecord,
  type SpaceRegistrationStage,
  SPACE_REGISTRATION_STAGES,
  formatSpaceRegistrationMonth,
  getCurrentSpaceRegistrationMonth,
  getSpaceRegistrationAge,
  shiftSpaceRegistrationMonth,
  summarizeSpaceRegistrations,
} from "@/lib/spaceRegistrations";
import { formatSheetDateTime } from "@/lib/inquiries";
import { cn } from "@/lib/utils";
import { useVisiblePolling } from "@/lib/useVisiblePolling";

const STAGE_STYLES: Record<SpaceRegistrationStage, { dot: string; badge: string }> = {
  접수: { dot: "bg-slate-400", badge: "border-slate-200 bg-slate-50 text-slate-700" },
  "검토 중": { dot: "bg-sky-500", badge: "border-sky-200 bg-sky-50 text-sky-700" },
  "확인 완료": { dot: "bg-amber-500", badge: "border-amber-200 bg-amber-50 text-amber-700" },
  "등록 완료": { dot: "bg-emerald-500", badge: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  반려: { dot: "bg-rose-500", badge: "border-rose-200 bg-rose-50 text-rose-700" },
};

interface Props {
  initialRegistrations: SpaceRegistrationRecord[];
  canEdit: boolean;
}

function displayDate(value: string): string {
  return value ? formatSheetDateTime(value) : "-";
}

function displayValue(value: string): string {
  return value || "-";
}

export function SpaceRegistrationKanban({ initialRegistrations, canEdit }: Props) {
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [now, setNow] = useState(() => new Date());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memoDraft, setMemoDraft] = useState("");
  const [memoSaving, setMemoSaving] = useState(false);
  const [summaryMonth, setSummaryMonth] = useState(() => getCurrentSpaceRegistrationMonth());

  useVisiblePolling(() => setNow(new Date()), 60_000, { immediate: false });

  const selected = selectedId ? registrations.find((item) => item.id === selectedId) ?? null : null;
  const summary = summarizeSpaceRegistrations(registrations, summaryMonth);
  const currentMonth = getCurrentSpaceRegistrationMonth(now);
  const summaryTitle = summaryMonth === currentMonth ? "이번 달" : formatSpaceRegistrationMonth(summaryMonth);

  const openDetail = (registration: SpaceRegistrationRecord) => {
    setSelectedId(registration.id);
    setMemoDraft(registration.memo);
  };

  const setSaving = (id: string, saving: boolean) => {
    setSavingIds((current) => {
      const next = new Set(current);
      if (saving) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const moveRegistration = async (registration: SpaceRegistrationRecord, nextStage: SpaceRegistrationStage) => {
    if (!canEdit || registration.status === nextStage || savingIds.has(registration.id)) return;

    const previous = registration;
    const optimisticTimestamp = formatSheetDateTime(new Date());
    const optimistic = withStageTimestamp({ ...registration, status: nextStage }, nextStage, optimisticTimestamp);
    setRegistrations((current) => current.map((item) => item.id === registration.id ? optimistic : item));
    setSaving(registration.id, true);

    try {
      const result = await updateSpaceRegistrationStage(registration.identity, nextStage);
      setRegistrations((current) => current.map((item) => (
        item.id === registration.id
          ? withStageTimestamp({ ...item, status: nextStage }, nextStage, result.timestamp)
          : item
      )));
      toast.success(`‘${nextStage}’ 단계로 옮겼습니다.`);
    } catch (error) {
      setRegistrations((current) => current.map((item) => item.id === registration.id ? previous : item));
      toast.error(error instanceof Error ? `시트 저장 실패: ${error.message}` : "시트 저장 실패");
    } finally {
      setSaving(registration.id, false);
      setDraggedId(null);
    }
  };

  const saveMemo = async () => {
    if (!selected) return;
    setMemoSaving(true);
    try {
      const result = await updateSpaceRegistrationMemo(selected.identity, memoDraft);
      setRegistrations((current) => current.map((item) => item.id === selected.id ? { ...item, memo: result.memo } : item));
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
              <span>{summaryTitle} 공간 등록 요약</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="이전 달"
                onClick={() => setSummaryMonth((current) => shiftSpaceRegistrationMonth(current, -1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="다음 달"
                onClick={() => setSummaryMonth((current) => shiftSpaceRegistrationMonth(current, 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground sm:text-sm">
            {summaryTitle} 공간 등록 <span className="font-semibold text-foreground">{summary.totalCount}</span>건 · {SPACE_REGISTRATION_STAGES.map((stage, index) => (
              <span key={stage}>{index > 0 && " · "}{stage} <span className="font-semibold text-foreground">{summary.stageCounts[stage]}</span></span>
            ))}
          </p>
        </div>

        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div className="text-sm text-muted-foreground">
            전체 <span className="font-semibold text-foreground">{registrations.length}</span>건
          </div>
          <div className="text-xs text-muted-foreground">
            {canEdit ? "카드를 끌어 단계에 놓으세요" : "상세 내용을 보려면 카드를 더블클릭하세요"}
          </div>
        </div>

        {registrations.length === 0 && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            <Inbox className="size-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-foreground">아직 등록된 공간이 없습니다.</p>
              <p className="mt-0.5 text-xs">‘공간 등록 접수’ 시트에 자료가 들어오면 이곳에 카드로 표시됩니다.</p>
            </div>
          </div>
        )}

        <div className="pb-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {SPACE_REGISTRATION_STAGES.map((stage) => {
              const items = registrations.filter((registration) => registration.status === stage);
              const style = STAGE_STYLES[stage];
              return (
                <section
                  key={stage}
                  className="flex min-h-56 min-w-0 flex-col rounded-xl border border-border bg-background/80 xl:min-h-[28rem]"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const registration = registrations.find((item) => item.id === event.dataTransfer.getData("text/plain"));
                    if (registration) void moveRegistration(registration, stage);
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
                        이 단계의 공간 등록이 없습니다.
                      </div>
                    ) : items.map((registration) => {
                      const age = getSpaceRegistrationAge(registration, now);
                      const saving = savingIds.has(registration.id);
                      return (
                        <article
                          key={registration.id}
                          draggable={!saving && canEdit}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", registration.id);
                            event.dataTransfer.effectAllowed = "move";
                            setDraggedId(registration.id);
                          }}
                          onDragEnd={() => setDraggedId(null)}
                          onDoubleClick={() => openDetail(registration)}
                          className={cn(
                            "cursor-grab rounded-xl border bg-card p-3 shadow-xs transition hover:-translate-y-0.5 hover:shadow-sm active:cursor-grabbing",
                            age.overdue
                              ? "border-rose-400 bg-rose-50/80 ring-2 ring-rose-200/70 dark:bg-rose-950/20"
                              : "border-border",
                            draggedId === registration.id && "opacity-50",
                            saving && "cursor-wait opacity-70",
                          )}
                          title="더블클릭하여 상세 보기"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">{displayValue(registration.spaceName)}</p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">접수 {displayDate(registration.receivedAt)}</p>
                            </div>
                            {age.overdue && (
                              <span className="shrink-0 rounded-md bg-rose-600 px-1.5 py-1 text-[10px] font-semibold text-white">
                                {age.dayLabel}
                              </span>
                            )}
                          </div>
                          <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-foreground/85">
                            {displayValue(registration.description)}
                          </p>
                          <div className="mt-3 space-y-1 border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
                            <p className="truncate">{displayValue(registration.spaceType)} · {displayValue(registration.desiredRegion)}</p>
                            <p>{displayValue(registration.area)}㎡ · {displayValue(registration.capacity)}명 · {displayValue(registration.dailyRate)}만원/일</p>
                            <p className="flex items-center gap-1.5 truncate"><Phone className="size-3 shrink-0" />{displayValue(registration.phone)}</p>
                            <p className="flex items-center gap-1.5 truncate"><Mail className="size-3 shrink-0" />{displayValue(registration.email)}</p>
                          </div>
                          <p className="mt-2 text-[11px] text-muted-foreground">사진 {displayValue(registration.photoCount)}장</p>
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
                <DialogTitle>{displayValue(selected.spaceName)} 공간 등록 상세</DialogTitle>
                <DialogDescription>‘공간 등록 접수’ 시트의 전체 열을 기준으로 표시합니다.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DetailField label="접수번호" value={displayValue(selected.registrationId)} />
                <DetailField label="접수일시 (한국시간)" value={displayDate(selected.receivedAt)} />
                <DetailField label="검토 상태" value={selected.status} />
                <DetailField label="담당자 이름" value={displayValue(selected.contactName)} icon={<UserRound className="size-3.5" />} />
                <DetailField label="공간과의 관계" value={displayValue(selected.relationship)} />
                <DetailField label="연락처 (비공개)" value={displayValue(selected.phone)} icon={<Phone className="size-3.5" />} />
                <DetailField label="이메일 (비공개)" value={displayValue(selected.email)} icon={<Mail className="size-3.5" />} />
                <DetailField label="공간명" value={displayValue(selected.spaceName)} />
                <DetailField label="공간 유형" value={displayValue(selected.spaceType)} />
                <DetailField label="상세 주소 (비공개)" value={displayValue(selected.address)} />
                <DetailField label="공개 희망 지역" value={displayValue(selected.desiredRegion)} />
                <DetailField label="면적 (㎡)" value={displayValue(selected.area)} />
                <DetailField label="수용 인원 (명)" value={displayValue(selected.capacity)} />
                <DetailField label="희망 1일 대관료 (만원)" value={displayValue(selected.dailyRate)} />
                <DetailField label="요금 협의 여부" value={displayValue(selected.negotiable)} />
                <DetailField label="사진 수" value={displayValue(selected.photoCount)} />
                <DetailField label="개인정보 동의 일시" value={displayDate(selected.privacyConsentAt)} />
                <DetailField label="등록·사진 사용 권한 확인" value={displayValue(selected.photoPermission)} />
                <DetailField label="관리 담당자" value={displayValue(selected.manager)} />
                <DetailField label="최종 처리일시" value={displayDate(selected.finalProcessedAt)} />
                <DetailField label="검토시작일시" value={displayDate(selected.reviewStartedAt)} />
                <DetailField label="확인완료일시" value={displayDate(selected.confirmationCompletedAt)} />
                <DetailField label="등록완료일시" value={displayDate(selected.registrationCompletedAt)} />
                <DetailField label="반려일시" value={displayDate(selected.rejectedAt)} />
                <div className="sm:col-span-2">
                  <DetailField label="사진 폴더 링크" value={displayValue(selected.photoFolderUrl)} link={selected.photoFolderUrl} />
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2">
                  <DetailField label="공간 소개" value={displayValue(selected.description)} multiline />
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2">
                  <DetailField label="시설·대관 조건" value={displayValue(selected.conditions)} multiline />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="space-registration-memo" className="text-xs font-medium text-muted-foreground">관리 메모</label>
                  <Textarea
                    id="space-registration-memo"
                    value={memoDraft}
                    onChange={(event) => setMemoDraft(event.target.value)}
                    rows={4}
                    placeholder="담당자가 남길 관리 메모"
                    readOnly={!canEdit}
                  />
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

function withStageTimestamp(
  registration: SpaceRegistrationRecord,
  stage: SpaceRegistrationStage,
  timestamp: string,
): SpaceRegistrationRecord {
  if (stage === "검토 중") return { ...registration, reviewStartedAt: timestamp, finalProcessedAt: timestamp };
  if (stage === "확인 완료") return { ...registration, confirmationCompletedAt: timestamp, finalProcessedAt: timestamp };
  if (stage === "등록 완료") return { ...registration, registrationCompletedAt: timestamp, finalProcessedAt: timestamp };
  if (stage === "반려") return { ...registration, rejectedAt: timestamp, finalProcessedAt: timestamp };
  return { ...registration, finalProcessedAt: timestamp };
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
      {link ? (
        <a href={link} target="_blank" rel="noreferrer" className="block truncate text-sm text-primary hover:underline">
          {value}
        </a>
      ) : (
        <p className={cn("text-sm text-foreground", multiline ? "whitespace-pre-wrap leading-6" : "truncate")}>{value}</p>
      )}
    </div>
  );
}
