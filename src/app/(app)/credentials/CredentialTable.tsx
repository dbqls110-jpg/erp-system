"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Eye, EyeOff, ExternalLink, Search, Copy } from "lucide-react";
import { createCredential, updateCredential, deleteCredential } from "@/app/actions/credential";
import { toneBadgeClass } from "@/lib/badge-tone";
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
const CATEGORY_TONES: Record<string, Parameters<typeof toneBadgeClass>[0]> = {
  "나라장터": "blue",
  "Google": "red",
  "Naver": "green",
  "Gmail": "amber",
  "Client": "purple",
  "정부24": "blue",
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
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
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
        <Button size="sm" className="h-9 py-2" onClick={() => onSave(form)} disabled={!form.name.trim() || saving}>
          {saving ? "저장 중..." : "저장"}
        </Button>
      </div>
    </div>
  );
}

export function CredentialTable({
  initialData,
  canEdit,
}: {
  initialData: Credential[];
  /**
   * 수정 권한. 서버 액션이 어차피 막지만, 눌러야만 오류가 나는 버튼을
   * 남겨두면 권한이 없는 사람에게는 고장난 화면으로 보인다.
   */
  canEdit: boolean;
}) {
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
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 h-9 text-sm"
            placeholder="서비스명, 회사, 구분 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canEdit && (
          <Button size="sm" className="h-9 gap-1.5 py-2" onClick={() => setDialog({ mode: "add" })}>
            <Plus className="size-3.5" /> 새로 만들기
          </Button>
        )}
      </div>

      <Card className="shadow-xs py-0">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Search className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{search ? "검색 결과가 없습니다." : "등록된 계정이 없습니다."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="[&_:is(th,td)]:px-4">
                <TableHeader className="bg-muted border-b border-border">
                  <TableRow>
                    {["서비스명", "회사", "구분", "아이디", "비밀번호", "비고", "링크", ""].map((h) => (
                      <TableHead key={h} className="text-left py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const pwVisible = visiblePw.has(c.id);
                    const catTone = c.category ? (CATEGORY_TONES[c.category] ?? "gray") : "gray";
                    return (
                      <TableRow key={c.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                        <TableCell className="py-2.5 font-medium text-foreground whitespace-nowrap">{c.name}</TableCell>
                        <TableCell className="py-2.5 text-muted-foreground whitespace-nowrap">{c.company ?? "—"}</TableCell>
                        <TableCell className="py-2.5">
                          {c.category ? (
                            <Badge variant="outline" className={`text-xs ${toneBadgeClass(catTone)}`}>{c.category}</Badge>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {c.username ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs">{c.username}</span>
                              <button onClick={() => copyToClipboard(c.username!, "아이디")} className="text-muted-foreground hover:text-primary transition-colors">
                                <Copy className="size-3.5" />
                              </button>
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {c.password ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs">
                                {pwVisible ? c.password : "••••••••"}
                              </span>
                              <button onClick={() => togglePw(c.id)} className="text-muted-foreground hover:text-primary transition-colors">
                                {pwVisible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                              </button>
                              <button onClick={() => copyToClipboard(c.password!, "비밀번호")} className="text-muted-foreground hover:text-primary transition-colors">
                                <Copy className="size-3.5" />
                              </button>
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5 text-muted-foreground max-w-[120px] truncate">{c.memo ?? "—"}</TableCell>
                        <TableCell className="py-2.5">
                          {c.url ? (
                            <a href={c.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline text-xs truncate max-w-[140px]">
                              {c.url.replace(/^https?:\/\//, "").split("/")[0]}
                              <ExternalLink className="size-3.5 shrink-0" />
                            </a>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {canEdit && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setDialog({ mode: "edit", item: c })}
                                className="text-muted-foreground hover:text-primary transition-colors"
                                title="수정"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(c.id)}
                                disabled={deletingId === c.id}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                                title="삭제"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}
