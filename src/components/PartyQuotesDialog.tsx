"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Paperclip, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listPartyQuotes, retryPartyQuotes, uploadPartyQuote } from "@/app/actions/partyQuote";
import { PARTY_QUOTE_ACCEPT, PARTY_QUOTE_MAX_BYTES, type PartyQuoteTarget } from "@/lib/partyQuotePolicy";

export function PartyQuotesDialog({ target, name, count, canEdit }: { target: PartyQuoteTarget; name: string; count: number; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<Awaited<ReturnType<typeof listPartyQuotes>>>([]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const load = async () => setFiles(await listPartyQuotes(target));
  function show() {
    setOpen(true); setError("");
    start(async () => { try { await load(); } catch { setError("견적서 목록을 읽지 못했습니다. 다시 열어 주세요."); } });
  }
  function upload(selected: File[]) {
    if (selected.length > 5 || selected.some(file => file.size <= 0 || file.size > PARTY_QUOTE_MAX_BYTES)) { toast.error("한 번에 5개, 파일당 10MB 이하만 첨부해 주세요."); return; }
    start(async () => {
      setError("");
      try {
        for (const file of selected) {
          const data = new FormData(); data.append("file", file); data.append("uploadId", crypto.randomUUID());
          const result = await uploadPartyQuote(target, data);
          if (!result.ready) toast.info("저장 중인 파일이 있습니다. 잠시 후 ‘저장 복구’로 확인해 주세요.");
        }
        toast.success("견적서 저장 결과를 확인했습니다.");
      } catch (err) { setError(err instanceof Error ? err.message : "저장하지 못했습니다."); }
      finally { if (input.current) input.current.value = ""; await load().catch(() => setError("목록을 갱신하지 못했습니다. 다시 열어 주세요.")); router.refresh(); }
    });
  }
  function recover() {
    start(async () => {
      setError("");
      try { const result = await retryPartyQuotes(target); await load(); router.refresh();
        toast.info(`${result.recovered}개 복구 · 미완료 ${result.pending}개${result.pending ? ": 원본을 다시 선택해 주세요." : ""}`);
      } catch { setError("복구 결과를 확인하지 못했습니다. 파일을 삭제하지 않았습니다."); }
    });
  }
  return <>
    <Button type="button" variant="outline" size="sm" onClick={show} aria-label={`${name} 견적서 ${count}개`}><Paperclip className="size-3.5" />견적서 {count}</Button>
    <Dialog open={open} onOpenChange={next => { if (!pending) setOpen(next); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{name} · 견적서</DialogTitle><DialogDescription>직원용 첨부함입니다. 프로젝트 매출·매입에는 자동 반영하지 않습니다.</DialogDescription></DialogHeader>
        <p className="text-xs text-muted-foreground">PDF·엑셀(XLS/XLSX)·JPG·PNG / 파일당 10MB, 한 번에 5개</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
          {files.length === 0 && <li className="p-4 text-sm text-muted-foreground">{pending ? "확인 중…" : "첨부된 견적서가 없습니다."}</li>}
          {files.map(file => <li key={file.id} className="flex items-center gap-2 p-3 text-sm"><FileText className="size-4 shrink-0" /><div className="min-w-0 flex-1"><p className="break-all font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{Math.ceil(file.size / 1024)} KB · {file.status === "ready" ? "저장 완료" : "저장 확인 필요"}</p></div>
            {file.status === "ready" && <a className="shrink-0 text-xs text-primary underline" href={`/api/party-quotes/${encodeURIComponent(file.id)}?kind=${target.kind}&partyId=${encodeURIComponent(target.id)}`}>다운로드</a>}
          </li>)}
        </ul>
        {canEdit && <div className="flex gap-2">
          <input type="file" multiple ref={input} accept={PARTY_QUOTE_ACCEPT} className="hidden" aria-label={`${name} 견적서 파일 선택`} onChange={e => upload(Array.from(e.target.files ?? []))} />
          <Button disabled={pending} onClick={() => input.current?.click()}><Upload className="size-4" />{pending ? "처리 중…" : "견적서 첨부"}</Button>
          <Button variant="outline" disabled={pending} onClick={recover}><RefreshCw className="size-4" />저장 복구</Button>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
