import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RevenueDates } from "@/lib/revenueDates";

export function RevenueDateFields({ prefix, dates = {}, disabled = false }: { prefix: string; dates?: Partial<RevenueDates>; disabled?: boolean }) {
  return <fieldset disabled={disabled} className="space-y-3">
    <legend className="mb-2 text-sm font-medium">매출 집계 날짜</legend>
    {([
      ["paidDate", "실제 입금일"], ["invoiceDate", "계산서 발행일"], ["expectedPaymentDate", "입금 예정일"],
    ] as const).map(([name, label]) => <div key={name} className="space-y-1.5">
      <Label htmlFor={`${prefix}-${name}`}>{label}</Label>
      <Input id={`${prefix}-${name}`} name={name} type="date" min="1900-01-01" max="2200-12-31" defaultValue={dates[name] ?? ""} />
    </div>)}
    <p className="text-xs text-muted-foreground">실제 입금일 → 계산서 발행일 → 입금 예정일 순으로 집계합니다. 모두 비우면 날짜 미정이며 월별 합계에서 제외됩니다.</p>
  </fieldset>;
}
