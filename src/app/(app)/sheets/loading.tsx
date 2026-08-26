import { Card, CardContent } from "@/components/ui/card";

/**
 * 구글 시트 화면이 뜨기 전에 보여줄 뼈대.
 *
 * 서버가 페이지를 다 만들 때까지 화면이 멈춰 있으면 느리게 느껴진다. 실제 배치와
 * 같은 모양을 먼저 그려 두면 클릭 즉시 반응하는 것처럼 보이고, 내용이 들어올 때
 * 자리가 튀지 않는다. 스피너 하나만 두면 두 효과가 다 사라진다.
 */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="h-9 w-24 animate-pulse rounded bg-muted" />
      </div>

      <div className="space-y-8">
        {Array.from({ length: 2 }).map((_, categoryIndex) => (
          <div key={categoryIndex} className="space-y-3">
            <div className="h-6 w-24 animate-pulse rounded bg-muted" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 3 }).map((_, cardIndex) => (
                <Card key={cardIndex} className="shadow-xs">
                  <CardContent className="flex items-center gap-3 p-3.5">
                    <div className="size-10 shrink-0 animate-pulse rounded bg-muted" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-full animate-pulse rounded bg-muted" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
