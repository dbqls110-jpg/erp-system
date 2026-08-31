"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Trash2, Plus, Sheet } from "lucide-react";
import { createSheetLink, updateSheetLink, deleteSheetLink } from "@/app/actions/sheets";

interface SheetLink {
  id: string;
  name: string;
  url: string;
  description: string | null;
  category: string | null;
  /** 우리 소유가 아닌 시트의 소유자. 우리 것이면 null. */
  externalOwner: string | null;
}

interface Props {
  sheets: SheetLink[];
  isAdmin: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  재무: "bg-blue-100 text-blue-700",
  프로젝트: "bg-violet-100 text-violet-700",
  인사: "bg-green-100 text-green-700",
  마케팅: "bg-orange-100 text-orange-700",
  기타: "bg-gray-100 text-gray-600",
};

function getCategoryColor(cat: string | null) {
  if (!cat) return "bg-gray-100 text-gray-600";
  return CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-600";
}

function Modal({
  initial,
  onClose,
  onSave,
}: {
  initial?: SheetLink;
  onClose: () => void;
  onSave: (data: { name: string; url: string; description: string; category: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("시트 이름을 입력해 주세요.");
      return;
    }
    if (!url.trim()) {
      setError("URL을 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), url: url.trim(), description: description.trim(), category });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "시트를 저장하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-modal-title"
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4"
      >
        <h2 id="sheet-modal-title" className="text-base font-semibold text-gray-900">
          {initial ? "시트 수정" : "시트 추가"}
        </h2>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">시트 이름 *</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="예: 2026 재무 현황"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">URL *</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">카테고리</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              <option value="">선택 안 함</option>
              <option value="재무">재무</option>
              <option value="프로젝트">프로젝트</option>
              <option value="인사">인사</option>
              <option value="마케팅">마케팅</option>
              <option value="널위문">널위문</option>
              <option value="노브">노브</option>
              <option value="클로원">클로원</option>
              <option value="입찰">입찰</option>
              <option value="기타">기타</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">설명</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="간단한 설명"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? "저장 중..." : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function SheetList({ sheets, isAdmin }: Props) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<SheetLink | null>(null);

  const grouped = sheets.reduce<Record<string, SheetLink[]>>((acc, s) => {
    const key = s.category ?? "기타";
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();

  async function handleDelete(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    try {
      await deleteSheetLink(id);
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "시트를 삭제하지 못했습니다.");
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-6">
        {isAdmin && <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
        >
          <Plus size={16} />
          시트 추가
        </button>}
      </div>

      {sheets.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Sheet size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">등록된 시트가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-8">
          {categories.map(cat => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getCategoryColor(cat)}`}>
                  {cat}
                </span>
                <span className="text-xs text-gray-400">{grouped[cat].length}개</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {grouped[cat].map(sheet => (
                  <a
                    key={sheet.id}
                    href={sheet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group bg-white border border-gray-100 rounded-xl p-3.5 hover:shadow-md hover:border-violet-200 transition-all block"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                          <Sheet size={20} className="text-green-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-base font-semibold text-gray-900">{sheet.name}</p>
                            {sheet.externalOwner && (
                              // 옮길 수 없는 시트라는 뜻이다. 그냥 두면 "왜 이것만
                              // 정리가 안 됐지"를 계속 다시 묻게 된다.
                              <span
                                title={`${sheet.externalOwner} 님 소유입니다. 공유받은 시트라 우리 드라이브로 옮길 수 없습니다.`}
                                className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-500"
                              >
                                외부 소유
                              </span>
                            )}
                          </div>
                          {sheet.description && (
                            <p className="mt-0.5 truncate text-sm text-gray-500">{sheet.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={e => { e.preventDefault(); setEditing(sheet); }}
                            aria-label={`${sheet.name} 수정`}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={e => { e.preventDefault(); void handleDelete(sheet.id); }}
                            aria-label={`${sheet.name} 삭제`}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                        <ExternalLink size={14} className="text-violet-400 ml-1" />
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal
          onClose={() => setShowAdd(false)}
          onSave={async (data) => {
            await createSheetLink(data);
            router.refresh();
          }}
        />
      )}
      {editing && (
        <Modal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await updateSheetLink(editing.id, data);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
