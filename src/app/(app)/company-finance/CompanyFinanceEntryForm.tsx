"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { addCompanyFinanceEntry } from "@/app/actions/companyFinance";
import { COMPANY_NAMES } from "@/lib/companyFinance";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CompanyFinanceEntryForm({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const reset = () => formRef.current?.reset();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      await addCompanyFinanceEntry(new FormData(event.currentTarget));
      toast.success("회사 매출·매입 내역을 등록했습니다.");
      setOpen(false);
      reset();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "등록에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="h-9 gap-1.5">
        <Plus size={15} aria-hidden="true" />
        매출·매입 등록
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen && !loading) reset();
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>회사 매출·매입 등록</DialogTitle>
            <DialogDescription>프로젝트와 별도로 회사 장부에 기록합니다.</DialogDescription>
          </DialogHeader>
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="company-finance-company">회사 *</Label>
                <select
                  id="company-finance-company"
                  name="company"
                  required
                  defaultValue=""
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="" disabled>선택하세요</option>
                  {COMPANY_NAMES.map((company) => <option key={company} value={company}>{company}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company-finance-type">구분 *</Label>
                <select
                  id="company-finance-type"
                  name="type"
                  required
                  defaultValue="revenue"
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="revenue">매출</option>
                  <option value="cost">매입</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-finance-date">발생일 *</Label>
              <Input id="company-finance-date" type="date" name="date" defaultValue={defaultDate} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-finance-title">항목명 *</Label>
              <Input id="company-finance-title" name="title" required placeholder="예: 행사 운영 대금" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-finance-amount">금액 (원) *</Label>
              <Input id="company-finance-amount" type="number" name="amount" min="1" step="1" required placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-finance-memo">메모</Label>
              <Textarea id="company-finance-memo" name="memo" rows={2} placeholder="필요한 경우 메모를 남겨 주세요." />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>취소</Button>
              <Button type="submit" disabled={loading}>{loading ? "등록 중..." : "등록"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
