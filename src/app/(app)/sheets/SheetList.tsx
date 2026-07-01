"use client";

import { useState } from "react";
import { ExternalLink, Pencil, Trash2, Plus, Sheet } from "lucide-react";
import { createSheetLink, updateSheetLink, deleteSheetLink } from "@/app/actions/sheets";

interface SheetLink {
  id: string;
  name: string;
  url: string;
  description: string | null;
  category: string | null;
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setLoading(true);
    await onSave({ name, url, description, category });
    setLoading(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4"
      >
        <h2 className="text-base font-semibold text-gray-900">
          {initial ? "시트 수정" : "시트 추가"}
        </h2>
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
    await deleteSheetLink(id);
  }

  return (
    <div>
      <div className="flex justify-end mb-6">
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
        >
          <Plus size={16} />
          시트 추가
        </button>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {grouped[cat].map(sheet => (
                  <a
                    key={sheet.id}
                    href={sheet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md hover:border-violet-200 transition-all block"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                          <Sheet size={20} className="text-green-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-gray-900 truncate">{sheet.name}</p>
                          {sheet.description && (
                            <p className="text-sm text-gray-500 truncate mt-0.5">{sheet.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => { e.preventDefault(); setEditing(sheet); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                        >
                          <Pencil size={14} />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={e => { e.preventDefault(); handleDelete(sheet.id); }}
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
          }}
        />
      )}
      {editing && (
        <Modal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await updateSheetLink(editing.id, data);
          }}
        />
      )}
    </div>
  );
}
