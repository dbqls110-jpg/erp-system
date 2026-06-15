"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Eye, EyeOff, ExternalLink, Search, Copy } from "lucide-react";
import { createCredential, updateCredential, deleteCredential } from "@/app/actions/credential";
import { toast } from "sonner";

interface Credential {
  id: string;
  name: string;
  company: string | null;
  category: string | null;
  username: string | null;
  password: string | null;
  memo: string | null;
  url: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  "나라장터": "bg-blue-50 text-blue-700 border-blue-200",
  "Google": "bg-red-50 text-red-700 border-red-200",
  "Naver": "bg-green-50 text-green-700 border-green-200",
  "Gmail": "bg-orange-50 text-orange-700 border-orange-200",
  "Client": "bg-pink-50 text-pink-700 border-pink-200",
  "정부24": "bg-teal-50 text-teal-700 border-teal-200",
};

const emptyForm = { name: "", company: "", category: "", username: "", password: "", memo: "", url: "" };

function CredentialForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: typeof emptyForm;
  onSave: (data: typeof emptyForm) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [showPw, setShowPw] = useState(false);
  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label>서비스명 <span className="text-destructive">*</span></Label>
          <Input placeholder="나라장터, Google 구글..." value={form.name} onChange={set("name")} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label>회사</Label>
          <Input placeholder="원스튜디오" value={form.company} onChange={set("company")} />
        </div>
        <div className="space-y-1.5">
          <Label>구분</Label>
          <Input placeholder="나라장터, Google..." value={form.category} onChange={set("category")} />
        </div>
        <div className="space-y-1.5">
          <Label>아이디</Label>
          <Input placeholder="ID" value={form.username} onChange={set("username")} />
        </div>
        <div className="space-y-1.5">
          <Label>비밀번호</Label>
          <div className="relative">
            <Input
              type={showPw ? "text" : "password"}
              placeholder="Password"
              value={form.password}
              onChange={set("password")}
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-smoke-gray hover:text-midnight-charcoal"
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>비고</Label>
          <Input placeholder="메모" value={form.memo} onChange={set("memo")} />
        </div>
        <div className="space-y-1.5">
          <Label>링크</Label>
          <Input placeholder="https://..." value={form.url} onChange={set("url")} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>취소</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={!form.name.trim() || saving}>
          {saving ? "저장 중..." : "저장"}
        </Button>
      </div>
    </div>
  );
}

export function CredentialTable({ initialData }: { initialData: Credential[] }) {
  const [items, setItems] = useState<Credential[]>(initialData);
  const [search, setSearch] = useState("");
  const [visiblePw, setVisiblePw] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; item: Credential } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = items.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.company ?? "").toLowerCase().includes(q) ||
      (c.category ?? "").toLowerCase().includes(q) ||
      (c.username ?? "").toLowerCase().includes(q) ||
      (c.memo ?? "").toLowerCase().includes(q)
    );
  });

  function togglePw(id: string) {
    setVisiblePw((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSave(data: typeof emptyForm) {
    setSaving(true);
    try {
      if (dialog?.mode === "edit") {
        await updateCredential(dialog.item.id, data);
        setItems((prev) =>
          prev.map((c) => (c.id === dialog.item.id ? { ...c, ...data, company: data.company || null, category: data.category || null, username: data.username || null, password: data.password || null, memo: data.memo || null, url: data.url || null } : c))
        );
        toast.success("수정됐습니다.");
      } else {
        await createCredential(data);
        // re-fetch via reload is simplest; for now optimistic with temp id
        toast.success("추가됐습니다.");
        window.location.reload();
        return;
      }
      setDialog(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 항목을 삭제하시겠습니까?")) return;
    setDeletingId(id);
    try {
      await deleteCredential(id);
      setItems((prev) => prev.filter((c) => c.id !== id));
      toast.success("삭제됐습니다.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setDeletingId(null);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} 복사됨`));
  }

  const dialogInitial =
    dialog?.mode === "edit"
      ? {
          name: dialog.item.name,
          company: dialog.item.company ?? "",
          category: dialog.item.category ?? "",
          username: dialog.item.username ?? "",
          password: dialog.item.password ?? "",
          memo: dialog.item.memo ?? "",
          url: dialog.item.url ?? "",
        }
      : emptyForm;

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-smoke-gray" />
          <Input
            className="pl-8 h-9 text-sm"
            placeholder="서비스명, 회사, 구분 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setDialog({ mode: "add" })}>
          <Plus size={14} /> 새로 만들기
        </Button>
      </div>

      <div className="rounded-lg border border-ash-gray overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-ash-gray">
              <tr>
                {["서비스명", "회사", "구분", "아이디", "비밀번호", "비고", "링크", ""].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-smoke-gray whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-smoke-gray text-sm">
                    {search ? "검색 결과가 없습니다." : "등록된 계정이 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const pwVisible = visiblePw.has(c.id);
                  const catCls = c.category ? (CATEGORY_COLORS[c.category] ?? "bg-gray-50 text-gray-600 border-gray-200") : "";
                  return (
                    <tr key={c.id} className="border-b border-ash-gray last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-3 py-2.5 font-medium text-midnight-charcoal whitespace-nowrap">{c.name}</td>
                      <td className="px-3 py-2.5 text-smoke-gray whitespace-nowrap">{c.company ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        {c.category ? (
                          <Badge variant="outline" className={`text-xs ${catCls}`}>{c.category}</Badge>
                        ) : <span className="text-smoke-gray">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {c.username ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs">{c.username}</span>
                            <button onClick={() => copyToClipboard(c.username!, "아이디")} className="text-smoke-gray hover:text-deep-violet transition-colors">
                              <Copy size={11} />
                            </button>
                          </div>
                        ) : <span className="text-smoke-gray">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {c.password ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs">
                              {pwVisible ? c.password : "••••••••"}
                            </span>
                            <button onClick={() => togglePw(c.id)} className="text-smoke-gray hover:text-deep-violet transition-colors">
                              {pwVisible ? <EyeOff size={11} /> : <Eye size={11} />}
                            </button>
                            <button onClick={() => copyToClipboard(c.password!, "비밀번호")} className="text-smoke-gray hover:text-deep-violet transition-colors">
                              <Copy size={11} />
                            </button>
                          </div>
                        ) : <span className="text-smoke-gray">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-smoke-gray max-w-[120px] truncate">{c.memo ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-deep-violet hover:underline text-xs truncate max-w-[140px]">
                            {c.url.replace(/^https?:\/\//, "").split("/")[0]}
                            <ExternalLink size={10} className="shrink-0" />
                          </a>
                        ) : <span className="text-smoke-gray">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setDialog({ mode: "edit", item: c })}
                            className="text-smoke-gray hover:text-deep-violet transition-colors"
                            title="수정"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            disabled={deletingId === c.id}
                            className="text-smoke-gray hover:text-destructive transition-colors"
                            title="삭제"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) setDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {dialog?.mode === "edit" ? "계정 수정" : "새 계정 추가"}
            </DialogTitle>
          </DialogHeader>
          {dialog && (
            <CredentialForm
              initial={dialogInitial}
              onSave={handleSave}
              onCancel={() => setDialog(null)}
              saving={saving}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
