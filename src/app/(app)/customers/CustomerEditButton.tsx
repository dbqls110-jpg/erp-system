"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateCustomer } from "@/app/actions/partnerCustomer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CustomerEditData {
  id: string;
  name: string;
  manager: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  industry: string | null;
  status: string;
  memo: string | null;
}

type FormState = {
  name: string;
  manager: string;
  phone: string;
  email: string;
  category: string;
  industry: string;
  status: string;
  memo: string;
};

const SELECT_CLASS = "h-9 w-full rounded-2xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

function toForm(customer: CustomerEditData): FormState {
  return {
    name: customer.name,
    manager: customer.manager ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    category: customer.category ?? "고객사",
    industry: customer.industry ?? "",
    status: customer.status,
    memo: customer.memo ?? "",
  };
}

export function CustomerEditButton({ customer, industries, iconOnly = false }: { customer: CustomerEditData; industries: string[]; iconOnly?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => toForm(customer));
  const [pending, startTransition] = useTransition();

  const set = (key: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setForm(toForm(customer));
    setOpen(nextOpen);
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast.error("거래처명을 입력해 주세요.");
      return;
    }

    startTransition(async () => {
      try {
        await updateCustomer(customer.id, form);
        toast.success("거래처를 수정했습니다.");
        handleOpenChange(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "거래처 수정에 실패했습니다.");
      }
    });
  }

  const datalistId = `customer-edit-industry-options-${customer.id}`;

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className={iconOnly ? "text-muted-foreground transition-colors hover:text-primary" : "rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-primary"}
        title={iconOnly ? "수정" : undefined}
        aria-label={`${customer.name} 수정`}
      >
        <Pencil className={iconOnly ? "size-3.5" : "mr-1 inline size-3.5"} />
        {!iconOnly && "수정"}
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>거래처 수정</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`customer-edit-name-${customer.id}`}>거래처명 *</Label>
              <Input id={`customer-edit-name-${customer.id}`} value={form.name} onChange={(event) => set("name")(event.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`customer-edit-manager-${customer.id}`}>담당자</Label>
              <Input id={`customer-edit-manager-${customer.id}`} value={form.manager} onChange={(event) => set("manager")(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`customer-edit-phone-${customer.id}`}>연락처</Label>
              <Input id={`customer-edit-phone-${customer.id}`} value={form.phone} onChange={(event) => set("phone")(event.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`customer-edit-email-${customer.id}`}>이메일</Label>
              <Input id={`customer-edit-email-${customer.id}`} type="email" value={form.email} onChange={(event) => set("email")(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`customer-edit-category-${customer.id}`}>분류</Label>
              <select id={`customer-edit-category-${customer.id}`} value={form.category} onChange={(event) => set("category")(event.target.value)} className={SELECT_CLASS}>
                <option value="고객사">고객사</option>
                <option value="협력사">협력사</option>
                <option value="공급사">공급사</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`customer-edit-industry-${customer.id}`}>업종</Label>
              <Input id={`customer-edit-industry-${customer.id}`} list={datalistId} value={form.industry} onChange={(event) => set("industry")(event.target.value)} placeholder="예: 제조업, IT" />
              <datalist id={datalistId}>
                {industries.map((industry) => <option key={industry} value={industry} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`customer-edit-status-${customer.id}`}>상태</Label>
              <select id={`customer-edit-status-${customer.id}`} value={form.status} onChange={(event) => set("status")(event.target.value)} className={SELECT_CLASS}>
                <option value="거래중">거래중</option>
                <option value="보류">보류</option>
                <option value="종료">종료</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`customer-edit-memo-${customer.id}`}>메모</Label>
              <textarea id={`customer-edit-memo-${customer.id}`} value={form.memo} onChange={(event) => set("memo")(event.target.value)} className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>취소</Button>
            <Button type="button" onClick={handleSave} disabled={pending || !form.name.trim()}>{pending ? "저장 중…" : "저장"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
