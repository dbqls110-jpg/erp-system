"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createCustomer } from "@/app/actions/partnerCustomer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMPTY_FORM = {
  name: "",
  manager: "",
  phone: "",
  email: "",
  category: "고객사",
  status: "거래중",
  memo: "",
};

export function CustomerCreateButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof typeof EMPTY_FORM) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setForm(EMPTY_FORM);
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast.error("거래처명을 입력해 주세요.");
      return;
    }
    startTransition(async () => {
      try {
        await createCustomer(form);
        toast.success("거래처를 등록했습니다.");
        handleOpenChange(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "거래처 등록에 실패했습니다.");
      }
    });
  }

  return (
    <>
      <Button className="h-9 py-2" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> 등록
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>거래처 등록</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="customer-name">거래처명 *</Label>
              <Input id="customer-name" value={form.name} onChange={(event) => set("name")(event.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-manager">담당자</Label>
              <Input id="customer-manager" value={form.manager} onChange={(event) => set("manager")(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-phone">연락처</Label>
              <Input id="customer-phone" value={form.phone} onChange={(event) => set("phone")(event.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="customer-email">이메일</Label>
              <Input id="customer-email" type="email" value={form.email} onChange={(event) => set("email")(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-category">분류</Label>
              <select id="customer-category" value={form.category} onChange={(event) => set("category")(event.target.value)} className="h-9 w-full rounded-2xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
                <option value="고객사">고객사</option>
                <option value="협력사">협력사</option>
                <option value="공급사">공급사</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-status">상태</Label>
              <select id="customer-status" value={form.status} onChange={(event) => set("status")(event.target.value)} className="h-9 w-full rounded-2xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
                <option value="거래중">거래중</option>
                <option value="보류">보류</option>
                <option value="종료">종료</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="customer-memo">메모</Label>
              <textarea id="customer-memo" value={form.memo} onChange={(event) => set("memo")(event.target.value)} className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>취소</Button>
            <Button type="button" onClick={handleSave} disabled={pending || !form.name.trim()}>{pending ? "등록 중…" : "등록"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
