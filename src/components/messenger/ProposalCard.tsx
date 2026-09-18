"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { calculateNetIncome } from "@/lib/financeMetrics";
import {
  type CalendarCreateContent,
  type ChecklistDoneContent,
  type CustomerFields,
  type ExpenseCreateContent,
  fieldLabel,
  type InquiryMemoContent,
  type InquiryMoveContent,
  type LeaveRequestContent,
  type MessageSendContent,
  type PartnerFields,
  type ProjectAmountContent,
  type ProjectCreateFields,
  validateProposal,
  type ProjectChecklistContent,
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

function displayMoney(value: number | null | undefined): string {
  return typeof value === "number" ? `${value.toLocaleString("ko-KR")}원` : "미상";
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
  initialState,
}: {
  proposal: Proposal;
  /** 같은 답변 안에서 몇 번째 제안인지. 서버가 답변을 다시 읽어 대조할 때 쓴다. */
  index: number;
  jobId: string;
  onApplied?: () => void;
  /** 서버 기록에서 되살린 상태. 있으면 다시 묻지 않는다. */
  initialState?: "done" | "cancelled";
}) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "cancelled">(initialState ?? "idle");
  // 되살린 done 은 결과 숫자(추가 n개 등)가 없으므로 문구를 단순하게 쓴다.
  const restored = state === initialState && initialState !== undefined;
  const [error, setError] = useState<string | null>(null);

  const { accepted, rejected } = validateProposal(proposal);
  const isSheetCreate = proposal.target === "sheet_create";
  const isProjectChecklist = proposal.target === "project_checklist";
  const isProjectCreate = proposal.target === "project_create";
  const isChecklistDone = proposal.target === "checklist_done";
  const isProjectAmount = proposal.target === "project_amount";
  const isInquiryMove = proposal.target === "inquiry_move";
  const isInquiryMemo = proposal.target === "inquiry_memo";
  const isCustomerCreate = proposal.target === "customer_create";
  const isCustomerUpdate = proposal.target === "customer_update";
  const isPartnerCreate = proposal.target === "partner_create";
  const isPartnerUpdate = proposal.target === "partner_update";
  const isExpenseCreate = proposal.target === "expense_create";
  const isCalendarCreate = proposal.target === "calendar_create";
  const isLeaveRequest = proposal.target === "leave_request";
  const isMessageSend = proposal.target === "message_send";
  const sheet = isSheetCreate ? (accepted as unknown as Partial<SheetCreateContent>) : null;
  const checklist = isProjectChecklist
    ? (accepted as unknown as Partial<ProjectChecklistContent>)
    : null;
  const checklistItems = checklist && Array.isArray(checklist.items) ? checklist.items : [];
  const projectCreate = isProjectCreate ? (accepted as unknown as Partial<ProjectCreateFields>) : null;
  const checklistDone = isChecklistDone ? (accepted as unknown as Partial<ChecklistDoneContent>) : null;
  const checklistDoneItems = checklistDone && Array.isArray(checklistDone.items) ? checklistDone.items : [];
  const projectAmount = isProjectAmount ? (accepted as unknown as Partial<ProjectAmountContent>) : null;
  const projectAmountEntries = projectAmount && Array.isArray(projectAmount.entries) ? projectAmount.entries : [];
  const inquiryMove = isInquiryMove ? (accepted as unknown as Partial<InquiryMoveContent>) : null;
  const inquiryMemo = isInquiryMemo ? (accepted as unknown as Partial<InquiryMemoContent>) : null;
  const customer = isCustomerCreate || isCustomerUpdate ? (accepted as unknown as Partial<CustomerFields>) : null;
  const partner = isPartnerCreate || isPartnerUpdate ? (accepted as unknown as Partial<PartnerFields>) : null;
  const expense = isExpenseCreate ? (accepted as unknown as Partial<ExpenseCreateContent>) : null;
  const calendar = isCalendarCreate ? (accepted as unknown as Partial<CalendarCreateContent>) : null;
  const leave = isLeaveRequest ? (accepted as unknown as Partial<LeaveRequestContent>) : null;
  const message = isMessageSend ? (accepted as unknown as Partial<MessageSendContent>) : null;
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
  const isStrictNewProposal = proposal.target === "space_registration_create" || isInquiryMove || isInquiryMemo || isCustomerCreate || isCustomerUpdate || isPartnerCreate || isPartnerUpdate || isExpenseCreate || isCalendarCreate || isLeaveRequest || isMessageSend;
  const nothingToApply = isSheetCreate
    ? rejected.length > 0 || typeof sheet?.title !== "string"
    : isProjectChecklist
      ? checklistItems.length === 0
      : isProjectCreate
        ? rejected.length > 0 || typeof projectCreate?.name !== "string"
        : isChecklistDone
          ? checklistDoneItems.length === 0 || typeof checklistDone?.done !== "boolean"
          : isProjectAmount
            ? projectAmountEntries.length === 0
            : isStrictNewProposal
              ? rejected.length > 0 || Object.keys(accepted).length === 0
            : Object.keys(accepted).length === 0;
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [projectUrl, setProjectUrl] = useState<string | null>(null);
  const [projectAlreadyExists, setProjectAlreadyExists] = useState(false);
  const [checklistResult, setChecklistResult] = useState<{
    addedCount: number;
    alreadyExistingCount: number;
  } | null>(null);
  const [checklistDoneResult, setChecklistDoneResult] = useState<{
    foundCount: number;
    notFoundCount: number;
    done: boolean;
  } | null>(null);
  const [projectAmountResult, setProjectAmountResult] = useState<{
    entryCount: number;
    revenue: number | null;
    cost: number | null;
    netIncome: number | null;
  } | null>(null);

  const cardTone = isProjectCreate
    ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/70 dark:bg-emerald-950/20"
    : isChecklistDone
      ? "border-slate-300 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-900/40"
      : isInquiryMove
        ? "border-sky-200 bg-sky-50/60 dark:border-sky-900/70 dark:bg-sky-950/20"
        : isInquiryMemo
          ? "border-amber-200 bg-amber-50/60 dark:border-amber-900/70 dark:bg-amber-950/20"
          : isCustomerCreate || isCustomerUpdate
            ? "border-indigo-200 bg-indigo-50/60 dark:border-indigo-900/70 dark:bg-indigo-950/20"
            : isPartnerCreate || isPartnerUpdate
              ? "border-violet-200 bg-violet-50/60 dark:border-violet-900/70 dark:bg-violet-950/20"
              : isExpenseCreate
                ? "border-rose-200 bg-rose-50/60 dark:border-rose-900/70 dark:bg-rose-950/20"
                : isCalendarCreate
                  ? "border-cyan-200 bg-cyan-50/60 dark:border-cyan-900/70 dark:bg-cyan-950/20"
                  : isLeaveRequest
                    ? "border-orange-200 bg-orange-50/60 dark:border-orange-900/70 dark:bg-orange-950/20"
                    : isMessageSend
                      ? "border-teal-200 bg-teal-50/60 dark:border-teal-900/70 dark:bg-teal-950/20"
      : "bg-background";
  const actionTone = isProjectCreate
    ? "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
    : isChecklistDone
      ? "bg-slate-600 text-white hover:bg-slate-700 dark:bg-slate-500 dark:hover:bg-slate-600"
      : isInquiryMove
        ? "bg-sky-600 text-white hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600"
        : isInquiryMemo
          ? "bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
          : isCustomerCreate || isCustomerUpdate
            ? "bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            : isPartnerCreate || isPartnerUpdate
              ? "bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600"
              : isExpenseCreate
                ? "bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600"
                : isCalendarCreate
                  ? "bg-cyan-600 text-white hover:bg-cyan-700 dark:bg-cyan-500 dark:hover:bg-cyan-600"
                  : isLeaveRequest
                    ? "bg-orange-600 text-white hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600"
                    : isMessageSend
                      ? "bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600"
      : "";

  async function apply() {
    setState("saving");
    setError(null);
    setSheetUrl(null);
    setProjectUrl(null);
    setProjectAlreadyExists(false);
    setChecklistResult(null);
    setChecklistDoneResult(null);
    setProjectAmountResult(null);
    try {
      const res = await fetch("/api/assistant/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, index }),
      });
      const data = (await res.json()) as {
        error?: string;
        name?: string;
        url?: string;
        projectId?: string;
        alreadyExists?: boolean;
        addedCount?: number;
        alreadyExistingCount?: number;
        foundCount?: number;
        notFoundCount?: number;
        done?: boolean;
        entryCount?: number;
        revenue?: number | null;
        cost?: number | null;
        netIncome?: number | null;
        customerId?: string;
        partnerId?: string;
        receiverId?: string;
        text?: string;
        stage?: string;
        month?: string;
        amount?: number;
        date?: string;
        endDate?: string | null;
      };
      if (!res.ok) {
        setError(data.error ?? "저장하지 못했습니다.");
        setState("idle");
        return;
      }
      setState("done");
      setSheetUrl(isSheetCreate ? data.url ?? null : null);
      setProjectUrl(isProjectCreate ? data.url ?? null : null);
      if (isProjectChecklist) {
        const addedCount = data.addedCount ?? 0;
        const alreadyExistingCount = data.alreadyExistingCount ?? 0;
        setChecklistResult({ addedCount, alreadyExistingCount });
        toast.success(`업무 ${addedCount}개를 추가했습니다.`);
      } else if (isProjectCreate) {
        setProjectAlreadyExists(Boolean(data.alreadyExists));
        toast.success(data.alreadyExists ? "같은 이름의 프로젝트가 이미 있습니다." : "프로젝트를 만들었습니다.");
      } else if (isChecklistDone) {
        const foundCount = data.foundCount ?? 0;
        const notFoundCount = data.notFoundCount ?? 0;
        const done = data.done ?? Boolean(checklistDone?.done);
        setChecklistDoneResult({ foundCount, notFoundCount, done });
        toast.success(done ? `업무 ${foundCount}건을 완료 처리했습니다.` : `업무 ${foundCount}건을 해제했습니다.`);
      } else if (isProjectAmount) {
        const entryCount = data.entryCount ?? projectAmountEntries.length;
        const revenue = data.revenue ?? null;
        const cost = data.cost ?? null;
        const netIncome = data.netIncome ?? calculateNetIncome(revenue, cost);
        setProjectAmountResult({ entryCount, revenue, cost, netIncome });
        toast.success(`매출·매입 ${entryCount}건을 반영했습니다.`);
      } else if (isInquiryMove) {
        toast.success(`문의 단계가 ‘${data.stage ?? inquiryMove?.stage ?? ""}’로 바뀌었습니다.`);
      } else if (isInquiryMemo) {
        toast.success("문의 메모에 덧붙였습니다.");
      } else if (isCustomerCreate || isCustomerUpdate) {
        toast.success(data.alreadyExists ? "같은 이름의 거래처가 이미 있습니다." : "거래처를 반영했습니다.");
      } else if (isPartnerCreate || isPartnerUpdate) {
        toast.success(data.alreadyExists ? "같은 이름의 파트너가 이미 있습니다." : "파트너를 반영했습니다.");
      } else if (isExpenseCreate) {
        toast.success("지출을 등록했습니다.");
      } else if (isCalendarCreate) {
        toast.success("캘린더 일정을 등록했습니다.");
      } else if (isLeaveRequest) {
        toast.success("본인의 휴가를 신청했습니다.");
      } else if (isMessageSend) {
        toast.success("메시지를 보냈습니다.");
      } else {
        toast.success(isSheetCreate ? "구글 시트를 만들었습니다." : `${data.name ?? "자료"}에 반영했습니다.`);
      }
      onApplied?.();
    } catch {
      setError("저장하지 못했습니다.");
      setState("idle");
    }
  }

  const targetLabel = proposal.target === "venue"
    ? "공간"
    : proposal.target === "venue_source_update"
      ? "공간 원본 동기화"
      : proposal.target === "venue_create"
        ? "공간 등록"
      : proposal.target === "space_registration_create"
        ? "공간 등록 접수"
    : proposal.target === "partner"
      ? "파트너"
      : proposal.target === "project"
        ? "프로젝트"
        : proposal.target === "drive_file"
          ? "Drive 파일"
          : proposal.target === "project_checklist"
            ? "프로젝트 업무"
            : proposal.target === "project_create"
              ? "프로젝트 만들기"
              : proposal.target === "checklist_done"
                ? "업무 완료·해제"
              : proposal.target === "project_amount"
                  ? "매출·매입"
                  : proposal.target === "inquiry_move"
                    ? "문의 단계 이동"
                    : proposal.target === "inquiry_memo"
                      ? "문의 메모"
                      : proposal.target === "customer_create"
                        ? "거래처 등록"
                        : proposal.target === "customer_update"
                          ? "거래처 수정"
                          : proposal.target === "partner_create"
                            ? "파트너 등록"
                            : proposal.target === "partner_update"
                              ? "파트너 수정"
                              : proposal.target === "expense_create"
                                ? "지출 등록"
                                : proposal.target === "calendar_create"
                                  ? "캘린더 일정"
                                  : proposal.target === "leave_request"
                                    ? "휴가 신청"
                                    : proposal.target === "message_send"
                                      ? "메시지 전송"
                  : "구글 시트";
  const savingLabel = proposal.target === "space_registration_create"
    ? "공간 등록 접수 중…"
    : isProjectCreate
    ? "프로젝트 만드는 중…"
    : isChecklistDone
      ? "업무 상태 적용 중…"
      : isProjectAmount
        ? "매출·매입 반영 중…"
        : isInquiryMove
          ? "문의 단계 적용 중…"
          : isInquiryMemo
            ? "문의 메모 저장 중…"
            : isCustomerCreate
              ? "거래처 등록 중…"
              : isCustomerUpdate
                ? "거래처 수정 중…"
                : isPartnerCreate
                  ? "파트너 등록 중…"
                  : isPartnerUpdate
                    ? "파트너 수정 중…"
                    : isExpenseCreate
                      ? "지출 등록 중…"
                      : isCalendarCreate
                        ? "일정 등록 중…"
                        : isLeaveRequest
                          ? "휴가 신청 중…"
                          : isMessageSend
                            ? "메시지 전송 중…"
        : isProjectChecklist
          ? "업무 추가 중…"
          : isSheetCreate
            ? "시트 만드는 중…"
            : "저장 중…";
  const applyLabel = proposal.target === "space_registration_create"
    ? "공간 등록 접수"
    : isProjectCreate
    ? "프로젝트 만들기"
    : isChecklistDone
      ? `업무 ${checklistDoneItems.length}건 적용`
    : isProjectAmount
        ? `매출·매입 ${projectAmountEntries.length}건 적용`
        : isInquiryMove
          ? `‘${inquiryMove?.stage ?? "단계"}’로 이동`
          : isInquiryMemo
            ? "메모 덧붙이기"
            : isCustomerCreate
              ? "거래처 등록"
              : isCustomerUpdate
                ? "거래처 수정"
                : isPartnerCreate
                  ? "파트너 등록"
                  : isPartnerUpdate
                    ? "파트너 수정"
                    : isExpenseCreate
                      ? "지출 등록"
                      : isCalendarCreate
                        ? "일정 등록"
                        : isLeaveRequest
                          ? "휴가 신청"
                          : isMessageSend
                            ? "메시지 보내기"
        : isProjectChecklist
          ? `업무 ${checklistItems.length}개 추가`
          : isSheetCreate
            ? "시트 만들기"
            : "저장";

  return (
    <div className={`rounded-xl border border-border p-3 ${cardTone}`}>
      <p className="text-xs font-medium text-foreground">
        {isSheetCreate
          ? (typeof sheet?.title === "string" ? sheet.title : "새 시트")
          : isProjectCreate
            ? "새 프로젝트"
            : proposal.label ?? proposal.id}
        <span className="ml-1.5 font-normal text-muted-foreground">
          {targetLabel}
        </span>
      </p>
      {proposal.reason && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{proposal.reason}</p>
      )}

      {isInquiryMove ? (
        <dl className="mt-2 space-y-1 text-xs">
          <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">갈래</dt><dd>{inquiryMove?.branch}</dd></div>
          <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">대상 단계</dt><dd className="font-medium">{inquiryMove?.stage}</dd></div>
        </dl>
      ) : isInquiryMemo ? (
        <div className="mt-2 rounded-lg border border-amber-200/70 bg-background/60 p-2.5 text-xs dark:border-amber-800/60">
          <p className="text-[11px] text-muted-foreground">{inquiryMemo?.branch} 문의에 덧붙일 메모</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-foreground">{inquiryMemo?.memo}</p>
        </div>
      ) : isCustomerCreate || isCustomerUpdate ? (
        <dl className="mt-2 space-y-1 text-xs">
          {Object.entries(customer ?? {}).map(([field, value]) => (
            <div key={field} className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">{fieldLabel(proposal.target, field)}</dt><dd className="text-foreground">{displayValue(value)}</dd></div>
          ))}
        </dl>
      ) : isPartnerCreate || isPartnerUpdate ? (
        <dl className="mt-2 space-y-1 text-xs">
          {Object.entries(partner ?? {}).map(([field, value]) => (
            <div key={field} className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">{fieldLabel(proposal.target, field)}</dt><dd className="text-foreground">{displayValue(value)}</dd></div>
          ))}
        </dl>
      ) : isExpenseCreate ? (
        <dl className="mt-2 space-y-1 text-xs">
          <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">월</dt><dd>{expense?.month}</dd></div>
          <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">카테고리</dt><dd>{expense?.category}</dd></div>
          <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">금액</dt><dd className="font-medium">{typeof expense?.amount === "number" ? `${expense.amount.toLocaleString("ko-KR")}원` : "-"}</dd></div>
          {expense?.memo && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">메모</dt><dd className="whitespace-pre-wrap break-words">{expense.memo}</dd></div>}
        </dl>
      ) : isCalendarCreate ? (
        <dl className="mt-2 space-y-1 text-xs">
          {Object.entries(calendar ?? {}).map(([field, value]) => (
            <div key={field} className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">{fieldLabel(proposal.target, field)}</dt><dd className="text-foreground">{displayValue(value)}</dd></div>
          ))}
        </dl>
      ) : isLeaveRequest ? (
        <dl className="mt-2 space-y-1 text-xs">
          <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">휴가 유형</dt><dd className="font-medium">{leave?.type === "annual" ? "연차" : leave?.type === "half_am" ? "반차(오전)" : leave?.type === "half_pm" ? "반차(오후)" : "시간차"}</dd></div>
          <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">기간</dt><dd>{leave?.start} ~ {leave?.end}</dd></div>
          {leave?.startTime && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">시간</dt><dd>{leave.startTime} ~ {leave.endTime}</dd></div>}
          {leave?.reason && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">사유</dt><dd className="whitespace-pre-wrap break-words">{leave.reason}</dd></div>}
        </dl>
      ) : isMessageSend ? (
        <div className="mt-2 space-y-2 text-xs">
          <p><span className="text-muted-foreground">받는 사람</span> <span className="font-medium text-foreground">{proposal.label ?? message?.to}</span></p>
          <div className="rounded-lg border border-teal-200/70 bg-background/60 p-2.5 dark:border-teal-800/60">
            <p className="text-[11px] text-muted-foreground">보낼 본문</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-foreground">{message?.text}</p>
          </div>
        </div>
      ) : isProjectCreate ? (
        <dl className="mt-2 space-y-1 text-xs">
          {Object.entries(projectCreate ?? {}).map(([field, value]) => (
            <div key={field} className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">{fieldLabel(proposal.target, field)}</dt>
              <dd className="text-foreground">{displayValue(value)}</dd>
            </div>
          ))}
        </dl>
      ) : isChecklistDone ? (
        <>
          <p className="mt-2 text-xs text-foreground">
            목표 상태: <span className="font-medium">{checklistDone?.done ? "완료" : "해제"}</span>
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-foreground">
            {checklistDoneItems.map((item, itemIndex) => (
              <li key={`${item}-${itemIndex}`}>{item}</li>
            ))}
          </ul>
        </>
      ) : isProjectAmount ? (
        <ul className="mt-2 space-y-1.5 text-xs text-foreground">
          {projectAmountEntries.map((entry, entryIndex) => (
            <li key={`${entry.kind}-${entry.amount}-${entryIndex}`}>
              <span className="font-medium">{entry.kind === "cost" ? "매입" : "매출"} {entry.amount.toLocaleString("ko-KR")}원</span>
              {entry.label ? ` · ${entry.label}` : ""}
              {entry.memo ? ` · ${entry.memo}` : ""}
            </li>
          ))}
        </ul>
      ) : isProjectChecklist ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-foreground">
          {checklistItems.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{item}</li>
          ))}
        </ul>
      ) : isSheetCreate ? (
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
            <Check className="size-3" />
            {restored
              ? "이미 반영했습니다"
              : isInquiryMove
              ? "문의 단계를 바꿨습니다"
              : isInquiryMemo
                ? "문의 메모에 덧붙였습니다"
                : isCustomerCreate
                  ? "거래처를 등록했습니다"
                  : isCustomerUpdate
                    ? "거래처를 수정했습니다"
                    : isPartnerCreate
                      ? "파트너를 등록했습니다"
                      : isPartnerUpdate
                        ? "파트너를 수정했습니다"
                        : isExpenseCreate
                          ? "지출을 등록했습니다"
                          : isCalendarCreate
                            ? "일정을 등록했습니다"
                            : isLeaveRequest
                              ? "휴가를 신청했습니다"
                              : isMessageSend
                                ? "메시지를 보냈습니다"
                                : isProjectCreate
              ? projectAlreadyExists ? "이미 있는 프로젝트입니다" : "프로젝트를 만들었습니다"
              : isChecklistDone
                ? `${checklistDoneResult?.done ? "완료" : "해제"} ${checklistDoneResult?.foundCount ?? 0}건 · 못 찾음 ${checklistDoneResult?.notFoundCount ?? 0}건`
                : isProjectAmount
                  ? `${projectAmountResult?.entryCount ?? 0}건 반영했습니다`
                  : isProjectChecklist
              ? `추가 ${checklistResult?.addedCount ?? 0}개 · 이미 있음 ${checklistResult?.alreadyExistingCount ?? 0}개`
              : isSheetCreate
                ? "시트를 만들었습니다"
                : "반영했습니다"}
          </p>
          {isProjectAmount && projectAmountResult && (
            <p className="mt-1">적용 뒤 합계 · 매출 {displayMoney(projectAmountResult.revenue)} · 매입 {displayMoney(projectAmountResult.cost)} · 당기순이익 {displayMoney(projectAmountResult.netIncome)}</p>
          )}
          {isProjectCreate && projectUrl && (
            <a href={projectUrl} className="mt-1 inline-block text-primary underline underline-offset-2">
              프로젝트 열기
            </a>
          )}
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
            className={`h-8 text-xs ${actionTone}`}
            onClick={apply}
            disabled={state === "saving" || nothingToApply}
            title={nothingToApply ? "적용할 수 있는 항목이 없습니다" : undefined}
          >
            {state === "saving" ? savingLabel : applyLabel}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => {
              setState("cancelled");
              // 기록에 남겨 다시 열 때 또 묻지 않게 한다. 실패해도 화면은 취소 상태를 유지한다.
              void fetch("/api/assistant/apply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId, index, cancel: true }),
              }).catch(() => undefined);
            }}
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
