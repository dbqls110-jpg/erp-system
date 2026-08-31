/**
 * 공간 DB 검색 화면이 뜨기 전에 검색 폼과 결과 영역의 자리를 먼저 보여 준다.
 */
export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse" role="status" aria-label="공간 DB를 불러오는 중">
      <div className="h-4 w-72 max-w-full rounded bg-muted" />
      <div className="rounded-xl border border-border p-6">
        <div className="space-y-4">
          <div className="h-9 w-full rounded-lg bg-muted" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="h-9 rounded-lg bg-muted" />
            ))}
          </div>
          <div className="h-6 w-3/4 rounded bg-muted" />
          <div className="flex justify-end">
            <div className="h-9 w-20 rounded-lg bg-muted" />
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-border p-4">
        <div className="h-8 w-full rounded bg-muted" />
        <div className="mt-2 space-y-2">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="h-10 w-full rounded bg-muted" />
          ))}
        </div>
      </div>
      <div className="h-64 rounded-xl bg-muted" />
    </div>
  );
}
