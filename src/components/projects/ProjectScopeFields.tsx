"use client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EVENT_TYPES } from "@/lib/projectReminderPolicy";

export function ProjectScopeFields({ workScope, eventType, eventDate, prefix }: { workScope?: string | null; eventType?: string; eventDate?: string | null; prefix: string }) {
  return <fieldset className="space-y-3 rounded-lg border border-border p-3">
    <legend className="px-1 text-sm font-semibold">과업 · 실제 일정</legend>
    <div className="space-y-1"><Label htmlFor={`${prefix}-scope`}>우리가 맡은 업무 범위</Label><Textarea id={`${prefix}-scope`} name="workScope" defaultValue={workScope ?? ""} maxLength={1000} rows={2} placeholder="예: 현수막 디자인·인쇄·설치" /></div>
    <div className="space-y-1"><Label htmlFor={`${prefix}-tasks`}>할 일 {prefix === "new-project" ? "목록" : "추가"}</Label><Textarea id={`${prefix}-tasks`} name="initialTasks" maxLength={15500} rows={2} placeholder={"시안 확인\n인쇄 발주"} /><p className="text-xs leading-relaxed text-muted-foreground">한 줄에 하나씩 입력합니다. 등록자는 담당자로 지정되며, 날짜는 미정으로 저장됩니다. 기존 할 일은 유지합니다.</p></div>
    <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label htmlFor={`${prefix}-type`}>업무 유형</Label><select id={`${prefix}-type`} name="eventType" defaultValue={eventType ?? "general"} className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">{Object.entries(EVENT_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="space-y-1"><Label htmlFor={`${prefix}-event`}>실제 공연·행사일</Label><Input id={`${prefix}-event`} name="eventDate" type="date" defaultValue={eventDate ?? ""} /></div></div>
    <p className="text-xs leading-relaxed text-muted-foreground">마감일과 별개입니다. 공연은 한 달 전, 행사는 7일 넘게 남으면 일주일 전·7일 이내면 하루 전에 오늘 할 일과 캘린더에 표시합니다. 이미 지난 리마인드일은 등록 당일에 표시하며, 날짜 미정은 생성하지 않습니다.</p>
  </fieldset>;
}
