/**
 * 회사 매출·매입 화면이 뜨기 전에 실제 카드와 목록 자리를 먼저 보여 준다.
 */
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="회사 매출·매입을 불러오는 중">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-4 w-72 max-w-full rounded bg-muted" />
          <div className="h-3 w-96 max-w-full rounded bg-muted" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-24 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-52 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-muted" />
    </div>
  );
}
