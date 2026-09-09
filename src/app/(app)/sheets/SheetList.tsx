"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Trash2, Plus, Sheet } from "lucide-react";
import { createSheetLink, updateSheetLink, deleteSheetLink } from "@/app/actions/sheets";
import { toneBadgeClass } from "@/lib/badge-tone";

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

const CATEGORY_TONES: Record<string, Parameters<typeof toneBadgeClass>[0]> = {
  재무: "blue",
  프로젝트: "violet",
  인사: "green",
  마케팅: "amber",
  기타: "gray",
};

/**
 * 분류에 돌려 쓸 색. gray 와 red 는 뺐다.
 * gray 는 분류가 없는 것, red 는 위험을 뜻해서 분류 이름에 붙으면 뜻이 섞인다.
 */
const CATEGORY_TONE_POOL: Array<Parameters<typeof toneBadgeClass>[0]> = [
  "blue",
  "violet",
  "green",
  "amber",
  "yellow",
  "purple",
];

/** 이름이 같으면 늘 같은 자리에서 시작하도록. FNV-1a. */
function toneSeed(category: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < category.length; index += 1) {
    hash ^= category.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * 분류마다 서로 다른 색을 준다.
 *
 * 이름만 해시하면 색이 겹친다 — 실제로 "입찰"과 "재무"가 둘 다 파랑이 됐다.
 * 색을 나눠 놓은 이유가 분류를 구분하기 위해서인데 그러면 의미가 없다.
 * 그래서 자기 자리가 이미 찼으면 빈 자리를 찾을 때까지 한 칸씩 밀어 본다.
 * 분류 목록이 같으면 결과도 같다.
 */
function buildCategoryTones(categories: string[]) {
  const assigned = new Map<string, string>();
  const used = new Set<Parameters<typeof toneBadgeClass>[0]>();

  // 고정 색을 가진 분류부터 자리를 잡는다. 사람이 정한 뜻이 밀리면 안 된다.
  const ordered = [...categories].sort((a, b) => {
    const fixed = Number(Boolean(CATEGORY_TONES[b])) - Number(Boolean(CATEGORY_TONES[a]));
    return fixed !== 0 ? fixed : a.localeCompare(b);
  });

  for (const category of ordered) {
    const preferred = CATEGORY_TONES[category];
    if (preferred && !used.has(preferred)) {
      used.add(preferred);
      assigned.set(category, toneBadgeClass(preferred));
      continue;
    }
    const seed = toneSeed(category);
    let tone = CATEGORY_TONE_POOL[seed % CATEGORY_TONE_POOL.length];
    for (let step = 1; used.has(tone) && step <= CATEGORY_TONE_POOL.length; step += 1) {
      tone = CATEGORY_TONE_POOL[(seed + step) % CATEGORY_TONE_POOL.length];
    }
    // 분류가 색보다 많으면 결국 겹친다. 그때는 겹치는 대로 둔다.
    used.add(tone);
    assigned.set(category, toneBadgeClass(tone));
  }
  return assigned;
}

function getCardDescription(sheet: SheetLink) {
  if (!sheet.description) return null;

  const pathParts = sheet.description.split("/").map((part) => part.trim()).filter(Boolean);
  const isRedundantDrivePath = pathParts.length > 1 && pathParts[pathParts.length - 1] === sheet.category;
  return isRedundantDrivePath ? null : sheet.description;
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
        className="bg-white dark:bg-card rounded-xl shadow-xl w-full max-w-md p-6 space-y-4"
      >
        <h2 id="sheet-modal-title" className="text-base font-semibold text-gray-900 dark:text-foreground">
          {initial ? "시트 수정" : "시트 추가"}
        </h2>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-muted-foreground mb-1 block">시트 이름 *</label>
            <input
              className="w-full border border-gray-200 dark:border-input dark:bg-background dark:text-foreground dark:placeholder:text-muted-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="예: 2026 재무 현황"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-muted-foreground mb-1 block">URL *</label>
            <input
              className="w-full border border-gray-200 dark:border-input dark:bg-background dark:text-foreground dark:placeholder:text-muted-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-muted-foreground mb-1 block">카테고리</label>
            <select
              className="w-full border border-gray-200 dark:border-input dark:bg-background dark:text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
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
            <label className="text-xs font-medium text-gray-600 dark:text-muted-foreground mb-1 block">설명</label>
            <input
              className="w-full border border-gray-200 dark:border-input dark:bg-background dark:text-foreground dark:placeholder:text-muted-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
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
            className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-border text-sm text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-muted"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2 rounded-lg bg-violet-600 dark:bg-violet-500 text-white text-sm font-medium hover:bg-violet-700 dark:hover:bg-violet-400 disabled:opacity-50"
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
  const categoryTones = buildCategoryTones(categories);

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
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 dark:bg-violet-500 text-white text-sm font-medium hover:bg-violet-700 dark:hover:bg-violet-400"
        >
          <Plus size={16} />
          시트 추가
        </button>}
      </div>

      {sheets.length === 0 ? (
        <div className="text-center py-20 text-gray-400 dark:text-muted-foreground">
          <Sheet size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">등록된 시트가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map(cat => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${categoryTones.get(cat) ?? toneBadgeClass("gray")}`}>
                  {cat}
                </span>
                <span className="text-xs text-gray-400 dark:text-muted-foreground">{grouped[cat].length}개</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {grouped[cat].map(sheet => {
                  const description = getCardDescription(sheet);
                  return (
                    <a
                      key={sheet.id}
                      href={sheet.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group bg-white dark:bg-card border border-gray-100 dark:border-border rounded-xl p-3.5 hover:shadow-md hover:border-violet-200 dark:hover:border-violet-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 dark:focus-visible:ring-violet-400/50 transition-all block"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-500/15 flex items-center justify-center shrink-0">
                            <Sheet size={20} className="text-green-600 dark:text-green-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-start gap-1.5">
                              <p className="line-clamp-2 text-base font-semibold text-gray-900 dark:text-foreground">{sheet.name}</p>
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
                            {description && (
                              <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-muted-foreground">{description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={e => { e.preventDefault(); setEditing(sheet); }}
                              aria-label={`${sheet.name} 수정`}
                              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-muted text-gray-400 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 dark:focus-visible:ring-violet-400/50"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={e => { e.preventDefault(); void handleDelete(sheet.id); }}
                              aria-label={`${sheet.name} 삭제`}
                              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 dark:text-muted-foreground hover:text-red-500 dark:hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 dark:focus-visible:ring-red-400/50"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          <ExternalLink size={14} className="text-violet-400 dark:text-violet-300 ml-1" />
                        </div>
                      </div>
                    </a>
                  );
                })}
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
