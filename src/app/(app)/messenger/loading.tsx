/**
 * 메신저 목록과 대화 패널이 준비되는 동안 실제 화면 구조를 먼저 보여 준다.
 */
export default function Loading() {
  return (
    <div className="h-full -m-4 sm:-m-6 animate-pulse" role="status" aria-label="메신저를 불러오는 중">
      <div className="flex h-full min-h-[32rem] bg-background">
        <div className="w-full shrink-0 border-r border-border sm:w-72">
          <div className="h-14 border-b border-border px-4 py-5">
            <div className="h-4 w-20 rounded bg-muted" />
          </div>
          <div className="space-y-1 p-2">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-lg px-2 py-3">
                <div className="size-9 shrink-0 rounded-full bg-muted" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-24 rounded bg-muted" />
                  <div className="h-3 w-36 max-w-full rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="hidden flex-1 sm:block">
          <div className="h-14 border-b border-border px-4 py-5">
            <div className="h-4 w-24 rounded bg-muted" />
          </div>
          <div className="flex h-[calc(100%-3.5rem)] items-center justify-center">
            <div className="h-4 w-48 rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
