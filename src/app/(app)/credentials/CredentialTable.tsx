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
import { createCredential, updateCredential, deleteCredential, readCredentialSecret } from "@/app/actions/credential";
import { toneBadgeClass } from "@/lib/badge-tone";
import { toast } from "sonner";

interface Credential {
  id: string;
  name: string;
  company: string | null;
  category: string | null;
  username?: string | null;
  password?: string | null;
  hasUsername?: boolean;
  hasPassword?: boolean;
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
              placeholder={initial.password ? "Password" : "기존 비밀번호 유지 (변경 시 입력)"}
              value={form.password}
              onChange={set("password")}
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "입력한 비밀번호 숨기기" : "입력한 비밀번호 표시"}
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
  const [revealedPw, setRevealedPw] = useState<Record<string, string>>({});
  const [revealedUsername, setRevealedUsername] = useState<Record<string, string>>({});
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

  async function togglePw(id: string) {
    if (revealedPw[id] !== undefined) {
      setRevealedPw((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    if (!window.confirm("비밀번호 표시 시 접근 기록이 남습니다. 계속하시겠습니까?")) return;
    try {
      const value = await readCredentialSecret(id, "reveal_password");
      setRevealedPw((prev) => ({ ...prev, [id]: value }));
      toast.success("비밀번호가 표시되었습니다. 접근 기록이 저장되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "접근 권한을 확인할 수 없습니다.");
    }
  }

  async function toggleUsername(id: string) {
    if (revealedUsername[id] !== undefined) {
      setRevealedUsername((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    if (!window.confirm("아이디 표시 시 접근 기록이 남습니다. 계속하시겠습니까?")) return;
    try {
      const value = await readCredentialSecret(id, "reveal_username");
      setRevealedUsername((prev) => ({ ...prev, [id]: value }));
      toast.success("아이디가 표시되었습니다. 접근 기록이 저장되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "접근 권한을 확인할 수 없습니다.");
    }
  }

  async function handleSave(data: typeof emptyForm) {
    setSaving(true);
    try {
      if (dialog?.mode === "edit") {
        await updateCredential(dialog.item.id, data);
        setItems((prev) => prev.map((c) => {
          if (c.id !== dialog.item.id) return c;
          return {
            ...c,
            name: data.name.trim(),
            company: data.company || null,
            category: data.category || null,
            memo: data.memo || null,
            url: data.url || null,
            hasUsername: data.username.trim() ? true : c.hasUsername,
            hasPassword: data.password ? true : c.hasPassword,
            // Never place newly entered secrets into client state.
            username: null,
            password: null,
          };
        }));
        setRevealedPw((prev) => { const next = { ...prev }; delete next[dialog.item.id]; return next; });
        setRevealedUsername((prev) => { const next = { ...prev }; delete next[dialog.item.id]; return next; });
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

  async function copyToClipboard(id: string, label: string, action: "copy_username" | "copy_password") {
    if (!window.confirm(`${label}를 복사하면 접근 기록이 남습니다. 계속하시겠습니까?`)) return;
    try {
      const text = await readCredentialSecret(id, action);
      await navigator.clipboard.writeText(text);
      toast.success(`${label}가 클립보드에 복사되었습니다. 접근 기록이 저장되었습니다.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "클립보드 복사에 실패했습니다.");
    }
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
            <>
            <div className="space-y-2 p-3 md:hidden">
              {filtered.map((c) => {
                const pwVisible = revealedPw[c.id] !== undefined;
                const usernameVisible = revealedUsername[c.id] !== undefined;
                return (
                  <article key={c.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-medium">{c.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{c.company ?? "회사 미상"} · {c.category ?? "구분 미상"}</p>
                      </div>
                      {canEdit && <div className="flex shrink-0 gap-1"><button type="button" onClick={() => setDialog({ mode: "edit", item: c })} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-primary" aria-label={`${c.name} 수정`}><Pencil className="size-3.5" /></button><button type="button" onClick={() => handleDelete(c.id)} disabled={deletingId === c.id} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`${c.name} 삭제`}><Trash2 className="size-3.5" /></button></div>}
                    </div>
                    <div className="mt-3 space-y-2 text-xs">
                      {c.hasUsername && <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">아이디</span><span className="flex items-center gap-1 font-mono"><span>{usernameVisible ? revealedUsername[c.id] : "••••••••"}</span><button type="button" onClick={() => void toggleUsername(c.id)} aria-label={`${c.name} 아이디 ${usernameVisible ? "숨기기" : "표시"}`} className="p-1 text-muted-foreground hover:text-primary">{usernameVisible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button><button type="button" onClick={() => void copyToClipboard(c.id, "아이디", "copy_username")} aria-label={`${c.name} 아이디 복사`} className="p-1 text-muted-foreground hover:text-primary"><Copy className="size-3.5" /></button></span></div>}
                      {c.hasPassword && <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">비밀번호</span><span className="flex items-center gap-1 font-mono"><span>{pwVisible ? revealedPw[c.id] : "••••••••"}</span><button type="button" onClick={() => void togglePw(c.id)} aria-label={`${c.name} 비밀번호 ${pwVisible ? "숨기기" : "표시"}`} className="p-1 text-muted-foreground hover:text-primary">{pwVisible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button><button type="button" onClick={() => void copyToClipboard(c.id, "비밀번호", "copy_password")} aria-label={`${c.name} 비밀번호 복사`} className="p-1 text-muted-foreground hover:text-primary"><Copy className="size-3.5" /></button></span></div>}
                      {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline"><span className="truncate">링크 열기</span><ExternalLink className="size-3.5 shrink-0" /></a>}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <p className="mb-2 text-xs text-muted-foreground md:hidden">표를 좌우로 밀어 더 많은 열을 볼 수 있습니다.</p>
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
                    const pwVisible = revealedPw[c.id] !== undefined;
                    const usernameVisible = revealedUsername[c.id] !== undefined;
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
                          {c.hasUsername ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs">{usernameVisible ? revealedUsername[c.id] : "••••••••"}</span>
                              <button
                                type="button"
                                onClick={() => void toggleUsername(c.id)}
                                aria-label={`${c.name} 아이디 ${usernameVisible ? "숨기기" : "표시"}`}
                                className="text-muted-foreground hover:text-primary transition-colors"
                              >
                                {usernameVisible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => void copyToClipboard(c.id, "아이디", "copy_username")}
                                aria-label={`${c.name} 아이디 복사`}
                                className="text-muted-foreground hover:text-primary transition-colors"
                              >
                                <Copy className="size-3.5" />
                              </button>
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {c.hasPassword ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs">
                                {pwVisible ? revealedPw[c.id] : "••••••••"}
                              </span>
                              <button
                                type="button"
                                onClick={() => void togglePw(c.id)}
                                aria-label={`${c.name} 비밀번호 ${pwVisible ? "숨기기" : "표시"}`}
                                className="text-muted-foreground hover:text-primary transition-colors"
                              >
                                {pwVisible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                              </button>
                              <button type="button" onClick={() => void copyToClipboard(c.id, "비밀번호", "copy_password")} aria-label={`${c.name} 비밀번호 복사`} className="text-muted-foreground hover:text-primary transition-colors">
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
                                type="button"
                                onClick={() => setDialog({ mode: "edit", item: c })}
                                className="text-muted-foreground hover:text-primary transition-colors"
                                title="수정"
                                aria-label={`${c.name} 수정`}
                              >
                                <Pencil className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(c.id)}
                                disabled={deletingId === c.id}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                                title="삭제"
                                aria-label={`${c.name} 삭제`}
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
            </>
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
