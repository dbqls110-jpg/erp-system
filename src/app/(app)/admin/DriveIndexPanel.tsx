"use client";

import { useCallback, useState } from "react";
import { ExternalLink, FolderSearch, Pause, Play, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface IndexFolder {
  id: string;
  name: string;
  webViewLink: string | null;
  active: boolean;
  allowedRoles: string[];
  lastScannedAt: string | null;
  _count: { files: number };
}

export interface DriveIndexInitialStatus {
  folders: IndexFolder[];
  totals: { files: number; chunks: number; byStatus: Record<string, number> };
}

interface SyncResult {
  scanned: number;
  changed: number;
  indexed: number;
  metadataOnly: number;
  skipped: number;
  errors: number;
  remaining: number;
  busy?: boolean;
}

function formatDate(value: string | null) {
  if (!value) return "아직 동기화 안 됨";
  return new Date(value).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

export function DriveIndexPanel({ initialStatus }: { initialStatus: DriveIndexInitialStatus }) {
  const [status, setStatus] = useState<DriveIndexInitialStatus>(initialStatus);
  const [folderUrl, setFolderUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/drive-index/folders", { cache: "no-store" });
    if (!response.ok) throw new Error("Drive 색인 상태 조회 실패");
    setStatus(await response.json());
  }, []);

  async function addFolder() {
    if (!folderUrl.trim()) return;
    setAdding(true);
    try {
      const response = await fetch("/api/admin/drive-index/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl: folderUrl.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "폴더 등록 실패");
      setFolderUrl("");
      await refresh();
      toast.success(`${data.folder.name} 폴더를 등록했습니다.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "폴더 등록 실패");
    } finally {
      setAdding(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const response = await fetch("/api/agent/drive-index/sync", { method: "POST" });
      const data = await response.json() as SyncResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "동기화 실패");
      await refresh();
      toast.success(
        data.busy
          ? "이미 동기화가 진행 중입니다."
          : `동기화 완료: ${data.indexed}개 색인, ${data.remaining}개 다음 회차`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "동기화 실패");
    } finally {
      setSyncing(false);
    }
  }

  async function toggleFolder(folder: IndexFolder) {
    try {
      const response = await fetch("/api/admin/drive-index/folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: folder.id, active: !folder.active }),
      });
      if (!response.ok) throw new Error("상태 변경 실패");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "상태 변경 실패");
    }
  }

  async function toggleEmployeeAccess(folder: IndexFolder) {
    const employeeAccess = folder.allowedRoles.includes("user");
    try {
      const response = await fetch("/api/admin/drive-index/folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: folder.id,
          allowedRoles: employeeAccess ? ["admin"] : ["admin", "user"],
        }),
      });
      if (!response.ok) throw new Error("검색 권한 변경 실패");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "검색 권한 변경 실패");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={folderUrl}
          onChange={(event) => setFolderUrl(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void addFolder(); }}
          placeholder="Google Drive 폴더 URL"
          className="flex-1"
        />
        <Button onClick={addFolder} disabled={adding || !folderUrl.trim()}>
          <Plus size={14} /> {adding ? "확인 중" : "폴더 추가"}
        </Button>
        <Button variant="outline" onClick={syncNow} disabled={syncing || !status.folders.some((folder) => folder.active)}>
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> {syncing ? "동기화 중" : "지금 동기화"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">파일 {status.totals.files}</Badge>
        <Badge variant="outline">검색 조각 {status.totals.chunks}</Badge>
        <Badge variant="outline">색인 완료 {status.totals.byStatus.indexed ?? 0}</Badge>
        <Badge variant="outline">내용 제외 {status.totals.byStatus.skipped ?? 0}</Badge>
        <span className="text-smoke-gray self-center">원본은 Drive에 유지 · 변경 파일만 10분마다 갱신</span>
      </div>

      {status.folders.length === 0 ? (
        <div className="py-6 text-center text-sm text-smoke-gray border border-dashed border-ash-gray rounded-md">
          <FolderSearch size={24} className="mx-auto mb-2 opacity-50" />
          색인할 회사 Drive 폴더를 추가하세요.
        </div>
      ) : (
        <div className="divide-y divide-ash-gray border-y border-ash-gray">
          {status.folders.map((folder) => (
            <div key={folder.id} className="flex items-center gap-3 py-3">
              <FolderSearch size={16} className="text-deep-violet shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{folder.name}</span>
                  {folder.webViewLink && (
                    <a href={folder.webViewLink} target="_blank" rel="noopener noreferrer" className="text-electric-blue" title="Drive에서 열기">
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
                <p className="text-xs text-smoke-gray">
                  파일 {folder._count.files}개 · {formatDate(folder.lastScannedAt)} · 권한 {folder.allowedRoles.join(", ")}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => toggleEmployeeAccess(folder)}>
                {folder.allowedRoles.includes("user") ? "직원 검색 허용" : "관리자만"}
              </Button>
              <Badge variant={folder.active ? "default" : "secondary"}>{folder.active ? "자동 동기화" : "중지"}</Badge>
              <Button variant="ghost" size="icon" onClick={() => toggleFolder(folder)} title={folder.active ? "동기화 중지" : "동기화 재개"}>
                {folder.active ? <Pause size={14} /> : <Play size={14} />}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
