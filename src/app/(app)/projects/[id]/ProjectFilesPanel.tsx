"use client";

import { useRef, useState, useTransition } from "react";
import { uploadProjectFile, deleteProjectFile } from "@/app/actions/projectFile";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, ExternalLink, FileText, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface ProjectFile {
  id: string;
  name: string;
  mimeType: string;
  driveUrl: string;
  size: number | null;
  createdAt: Date;
}

interface Props {
  projectId: string;
  files: ProjectFile[];
  hasDriveAccess: boolean;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProjectFilesPanel({ projectId, files, hasDriveAccess }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      try {
        await uploadProjectFile(projectId, formData);
        toast.success(`"${file.name}" 업로드 완료`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "업로드 실패");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  function handleDelete(file: ProjectFile) {
    setDeletingId(file.id);
    startTransition(async () => {
      try {
        await deleteProjectFile(file.id, projectId);
        toast.success(`"${file.name}" 삭제 완료`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleUpload}
      />

      {files.length === 0 ? (
        <p className="text-sm text-smoke-gray py-2">첨부된 파일이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-ash-gray bg-canvas-white hover:bg-hint-of-sky/40 transition-colors">
              <FileText size={16} className="text-smoke-gray shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-midnight-charcoal truncate">{file.name}</p>
                <p className="text-xs text-smoke-gray">{formatBytes(file.size)}</p>
              </div>
              <a
                href={file.driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-smoke-gray hover:text-deep-violet transition-colors shrink-0"
                title="Google Drive에서 열기"
              >
                <ExternalLink size={15} />
              </a>
              <button
                onClick={() => handleDelete(file)}
                disabled={isPending && deletingId === file.id}
                className="text-smoke-gray hover:text-destructive transition-colors shrink-0 disabled:opacity-50"
                title="삭제"
              >
                {isPending && deletingId === file.id ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Trash2 size={15} />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!hasDriveAccess ? (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm">
          <AlertCircle size={15} className="text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800">Google Drive 연결 필요</p>
            <p className="text-yellow-700 text-xs mt-0.5">파일 업로드를 사용하려면 로그아웃 후 재로그인 시 Drive 권한을 허용해 주세요.</p>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isPending}
          className="gap-2"
        >
          {isPending && !deletingId ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Upload size={14} />
          )}
          파일 업로드
        </Button>
      )}
    </div>
  );
}
