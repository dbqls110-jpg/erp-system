"use client";

import { useMemo, useState } from "react";
import { Download, Handshake, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toneBadgeClass } from "@/lib/badge-tone";
import { createPartner, deletePartner, updatePartner } from "@/app/actions/partnerCustomer";

export interface PartnerRow {
  id: string;
  name: string;
  job: string | null;
  phone: string | null;
  contractStatus: string;
  settlementType: string | null;
  memo: string | null;
  projectNames: string[];
}

const CONTRACT_STATUSES = ["진행중", "만료", "대기"];
const SETTLEMENT_TYPES = ["월정산", "건별"];

const SELECT_CLASS =
  "h-8 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

const emptyForm = {
  name: "",
  job: "",
  phone: "",
  contractStatus: "대기",
  settlementType: "",
  memo: "",
};
type FormState = typeof emptyForm;

function statusTone(status: string) {
  return status === "진행중" ? "green" : status === "만료" ? "gray" : "amber";
}

function PartnerDialog({
  open,
  initial,
  saving,
  onClose,
  onSave,
  isEdit,
}: {
  open: boolean;
  isEdit: boolean;
  initial: FormState;
  saving: boolean;
  onClose: () => void;
  onSave: (form: FormState) => void;
}) {
  // 초기값은 마운트 때 한 번만 쓴다. 열 때마다 새 값으로 시작해야 하므로
  // 부모가 key 를 바꿔 리마운트시킨다. 렌더 중에 상태를 되돌리는 것보다
  // 리마운트가 React 가 의도한 방식이고 규칙에도 맞다.
  const [form, setForm] = useState<FormState>(initial);

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{isEdit ? "파트너 수정" : "파트너 등록"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">이름 *</Label>
            <Input
              id="p-name"
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="예: 김철수"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-job">직업</Label>
            <Input
              id="p-job"
              value={form.job}
              onChange={(e) => set("job")(e.target.value)}
              placeholder="예: 사진, 영상, MC, 음향"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-status">계약상태</Label>
              <select
                id="p-status"
                className={`${SELECT_CLASS} w-full`}
                value={form.contractStatus}
                onChange={(e) => set("contractStatus")(e.target.value)}
              >
                {CONTRACT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-settlement">정산방식</Label>
              <select
                id="p-settlement"
                className={`${SELECT_CLASS} w-full`}
                value={form.settlementType}
                onChange={(e) => set("settlementType")(e.target.value)}
              >
                <option value="">선택 안 함</option>
                {SETTLEMENT_TYPES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-phone">연락처</Label>
            <Input
              id="p-phone"
              value={form.phone}
              onChange={(e) => set("phone")(e.target.value)}
              placeholder="010-0000-0000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-memo">비고</Label>
            <Input
              id="p-memo"
              value={form.memo}
              onChange={(e) => set("memo")(e.target.value)}
              placeholder="특이사항"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              취소
            </Button>
            <Button size="sm" onClick={() => onSave(form)} disabled={!form.name.trim() || saving}>
              {saving ? "저장 중…" : "저장"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PartnerTable({
  initialData,
  canEdit,
}: {
  initialData: PartnerRow[];
  /** 수정 권한. 서버 액션도 막지만, 눌러야만 오류가 나는 버튼은 고장난 화면으로 보인다. */
  canEdit: boolean;
}) {
  const router = useRouter();

  const [status, setStatus] = useState("all");
  const [settlement, setSettlement] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState("latest");
  const [pageSize, setPageSize] = useState(10);

  const [dialog, setDialog] = useState<{ initial: FormState; id: string | null; key: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const rows = initialData.filter((p) => {
      if (status !== "all" && p.contractStatus !== status) return false;
      if (settlement !== "all" && (p.settlementType ?? "") !== settlement) return false;
      if (kw && !`${p.name} ${p.job ?? ""}`.toLowerCase().includes(kw)) return false;
      return true;
    });
    // 목록 순서는 서버가 최신순으로 주므로 이름순일 때만 다시 정렬한다.
    return sort === "name" ? [...rows].sort((a, b) => a.name.localeCompare(b.name, "ko")) : rows;
  }, [initialData, status, settlement, keyword, sort]);

  const shown = filtered.slice(0, pageSize);

  function resetFilters() {
    setStatus("all");
    setSettlement("all");
    setKeyword("");
  }

  async function handleSave(form: FormState) {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        job: form.job,
        phone: form.phone,
        contractStatus: form.contractStatus,
        settlementType: form.settlementType,
        memo: form.memo,
      };
      if (dialog?.id) {
        await updatePartner(dialog.id, payload);
        toast.success("파트너를 수정했습니다.");
      } else {
        await createPartner(payload);
        toast.success("파트너를 등록했습니다. 구글 시트에도 반영됩니다.");
      }
      setDialog(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: PartnerRow) {
    if (!window.confirm(`'${p.name}' 님을 삭제하시겠습니까?`)) return;
    setBusyId(p.id);
    try {
      await deletePartner(p.id);
      toast.success("삭제했습니다.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusyId(null);
    }
  }

  /** 브라우저에서 바로 만든다. 목록이 작아 서버를 거칠 이유가 없다. */
  function downloadCsv() {
    const header = ["이름", "직업", "계약상태", "정산방식", "연락처", "진행한 프로젝트", "비고"];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      header.map(escape).join(","),
      ...filtered.map((p) =>
        [
          p.name,
          p.job ?? "",
          p.contractStatus,
          p.settlementType ?? "",
          p.phone ?? "",
          p.projectNames.join(", "),
          p.memo ?? "",
        ]
          .map(escape)
          .join(","),
      ),
    ];
    // 엑셀이 UTF-8 을 알아보게 BOM 을 붙인다. 없으면 한글이 깨진다.
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `파트너_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="mt-1 text-sm text-muted-foreground">파트너 개인별 계약 현황</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-9 py-2" onClick={() => router.refresh()}>
            <RefreshCw className="size-3.5" /> 새로고침
          </Button>
          {canEdit && (
            <Button
              className="h-9 py-2"
              onClick={() => setDialog({ initial: { ...emptyForm }, id: null, key: Date.now() })}
            >
              <Plus className="size-3.5" /> 등록
            </Button>
          )}
        </div>
      </div>

      <Card className="shadow-xs">
        <CardContent className="space-y-3 pt-(--card-spacing)">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">계약상태</span>
            <select
              className={`${SELECT_CLASS} w-36`}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">전체</option>
              {CONTRACT_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">정산방식</span>
            <select
              className={`${SELECT_CLASS} w-36`}
              value={settlement}
              onChange={(e) => setSettlement(e.target.value)}
            >
              <option value="all">전체</option>
              {SETTLEMENT_TYPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">검색키워드</span>
            <Input
              className="h-8 w-72"
              placeholder="이름 또는 직업 입력"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            {/* 조회 버튼은 두지 않는다. 입력하는 대로 목록이 걸러지므로 누를 것이 없다. */}
            <Button variant="outline" className="h-8" onClick={resetFilters}>
              초기화
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm">
          총 <span className="font-semibold text-primary">{filtered.length}</span>건
          {filtered.length !== initialData.length && (
            <span className="ml-1 text-muted-foreground">(전체 {initialData.length}건)</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-8"
            onClick={downloadCsv}
            disabled={filtered.length === 0}
          >
            <Download className="size-3.5" /> 엑셀 다운로드
          </Button>
          <select
            className={`${SELECT_CLASS} w-32`}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="latest">최종수정일순</option>
            <option value="name">이름순</option>
          </select>
          <select
            className={`${SELECT_CLASS} w-28`}
            value={String(pageSize)}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            <option value="10">10개씩 보기</option>
            <option value="20">20개씩 보기</option>
            <option value="50">50개씩 보기</option>
          </select>
        </div>
      </div>

      <Card className="shadow-xs py-0">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="[&_:is(th,td)]:px-4">
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>직업</TableHead>
                  <TableHead>계약상태</TableHead>
                  <TableHead>정산방식</TableHead>
                  <TableHead>연락처</TableHead>
                  <TableHead>진행한 프로젝트</TableHead>
                  {canEdit && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 7 : 6} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Handshake className="size-6 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          {initialData.length === 0
                            ? "아직 등록된 항목이 없습니다"
                            : "조건에 맞는 파트너가 없습니다"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  shown.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.job ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={toneBadgeClass(statusTone(p.contractStatus))}>
                          {p.contractStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.settlementType ?? "-"}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{p.phone ?? "-"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {/* 건수만 적으면 "어느 프로젝트였지"를 다시 찾아봐야 한다. 이름을 보여준다. */}
                        {p.projectNames.length === 0 ? (
                          "-"
                        ) : (
                          <span title={p.projectNames.join(", ")}>
                            {p.projectNames.slice(0, 2).join(", ")}
                            {p.projectNames.length > 2 ? ` 외 ${p.projectNames.length - 2}건` : ""}
                          </span>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() =>
                                setDialog({
                                  id: p.id,
                                  key: Date.now(),
                                  initial: {
                                    name: p.name,
                                    job: p.job ?? "",
                                    phone: p.phone ?? "",
                                    contractStatus: p.contractStatus,
                                    settlementType: p.settlementType ?? "",
                                    memo: p.memo ?? "",
                                  },
                                })
                              }
                              className="text-muted-foreground transition-colors hover:text-primary"
                              title="수정"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(p)}
                              disabled={busyId === p.id}
                              className="text-muted-foreground transition-colors hover:text-destructive"
                              title="삭제"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {dialog && (
        <PartnerDialog
          key={dialog.key}
          isEdit={dialog.id !== null}
          open
          initial={dialog.initial}
          saving={saving}
          onClose={() => setDialog(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
