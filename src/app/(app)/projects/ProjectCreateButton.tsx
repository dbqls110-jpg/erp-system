"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProject } from "@/app/actions/project";
import { analyzeQuote } from "@/app/actions/quote";
import type { QuoteAnalysis } from "@/lib/quoteParser";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2, Plus } from "lucide-react";
import { COMPANY_NAMES } from "@/lib/companyFinance";
import { isInternalQuoteFileName } from "@/lib/quotePolicy";

export function ProjectCreateButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [quoteAnalysis, setQuoteAnalysis] = useState<QuoteAnalysis | null>(null);
  const [quoteFileNames, setQuoteFileNames] = useState<string[]>([]);
  const [internalQuoteFileCount, setInternalQuoteFileCount] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetDraft = () => {
    formRef.current?.reset();
    setQuoteAnalysis(null);
    setQuoteFileNames([]);
    setInternalQuoteFileCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleQuoteFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const internalFiles = files.filter((file) => isInternalQuoteFileName(file.name));
    setQuoteAnalysis(null);
    setQuoteFileNames(files.map((file) => file.name));
    setInternalQuoteFileCount(internalFiles.length);
    if (files.length === 0) return;

    if (internalFiles.length === 0) {
      toast.info("자료용으로 저장합니다 (금액 미반영).");
      return;
    }

    if (internalFiles.length > 1) {
      toast.info(`내부용 견적서 ${internalFiles.length}개가 선택되어 첫 번째 파일로 금액을 계산합니다.`);
    }

    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.set("file", internalFiles[0]);
      const analysis = await analyzeQuote(formData);
      setQuoteAnalysis(analysis);
      if (analysis.source === "unsupported" || analysis.confidence === "none") {
        toast.info("파일은 첨부되지만 금액을 자동으로 읽지 못했습니다.");
      } else {
        toast.success("견적서 금액을 입력창에 반영했습니다. 저장 전에 확인해 주세요.");
      }
    } catch {
      toast.error("견적서 분석에 실패했습니다. 파일은 첨부할 수 있으니 금액을 직접 입력해 주세요.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await createProject(new FormData(e.currentTarget));
      const amountWasExtracted = Boolean(result.quoteAnalysis && (result.quoteAnalysis.revenue !== null || result.quoteAnalysis.cost !== null));
      toast.success(amountWasExtracted ? "견적서 금액을 반영해 프로젝트가 생성됐습니다." : result.fileUploaded ? "프로젝트와 견적서가 생성됐습니다." : "프로젝트가 생성됐습니다.");
      if (result.materialOnlyFileNames.length > 0) {
        toast.info(`자료용으로 저장했습니다 (금액 미반영): ${result.materialOnlyFileNames.join(", ")}`);
      }
      if (result.internalQuoteFileCount > 1) {
        toast.info(`내부용 견적서 ${result.internalQuoteFileCount}개 중 첫 번째 파일로 금액을 반영했습니다.`);
      }
      if (result.warning) toast.warning(result.warning);
      setOpen(false);
      resetDraft();
    } catch {
      toast.error("생성 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2 bg-dark-onyx text-white hover:bg-muted" style={{ borderRadius: "9px" }}>
        <Plus size={16} /> 새 프로젝트
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen && !loading) resetDraft();
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>새 프로젝트</DialogTitle></DialogHeader>
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>프로젝트명 *</Label>
              <Input name="name" required placeholder="예: 마늘축제" />
            </div>
            <div className="space-y-1">
              <Label>클라이언트</Label>
              <Input name="client" placeholder="클라이언트명" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="project-company">회사</Label>
              <select
                id="project-company"
                name="company"
                defaultValue=""
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">회사 미지정</option>
                {COMPANY_NAMES.map((company) => <option key={company} value={company}>{company}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>마감일</Label>
              <Input type="date" name="deadline" />
            </div>
            <div className="space-y-1">
              <Label>담당자</Label>
              <Input name="assignee" placeholder="담당자 이름" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quoteFile">견적서 첨부</Label>
              <Input
                id="quoteFile"
                ref={fileInputRef}
                type="file"
                name="quoteFile"
                multiple
                accept=".pdf,.txt,.csv,.json,.doc,.docx,.xls,.xlsx,.hwp,.hwpx,image/*,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleQuoteFileChange}
                disabled={loading || analyzing}
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">여러 파일을 선택할 수 있습니다. 파일명에 내부용이 있는 첫 번째 견적서만 금액을 분석해 매출·매입 목록에 추가하고, 나머지는 자료용으로 저장합니다. HWP/HWPX는 원본만 저장합니다.</p>
              {quoteFileNames.length > 0 && (
                <p className="text-xs text-muted-foreground break-all">선택 파일: {quoteFileNames.join(", ")}</p>
              )}
              {quoteFileNames.length > 0 && internalQuoteFileCount === 0 && (
                <p className="text-xs text-amber-700">자료용으로 저장합니다 (금액 미반영).</p>
              )}
              {internalQuoteFileCount > 1 && (
                <p className="text-xs text-amber-700">내부용 견적서 {internalQuoteFileCount}개 중 첫 번째 파일만 금액 분석에 사용합니다.</p>
              )}
              {analyzing && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 size={13} className="animate-spin" /> {quoteFileNames[0] || "견적서"} 분석 중...
                </div>
              )}
              {!analyzing && quoteAnalysis && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                  <div className="flex items-start gap-1.5">
                    {quoteAnalysis.confidence === "none" ? <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-600" /> : <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />}
                    <div className="space-y-1">
                      <p className="font-medium">{quoteFileNames.find(isInternalQuoteFileName) || "견적서"} 분석 결과</p>
                      <p className="text-muted-foreground">{quoteAnalysis.note}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>메모</Label>
              <Textarea name="memo" rows={2} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
              <Button type="submit" disabled={loading || analyzing} className="bg-dark-onyx text-white" style={{ borderRadius: "9px" }}>
                {loading ? "생성 중..." : analyzing ? "견적서 분석 중..." : "생성"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
