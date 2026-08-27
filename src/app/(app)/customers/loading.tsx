import { Card, CardContent } from "@/components/ui/card";

/**
 * 거래처 화면이 뜨기 전에 보여줄 뼈대.
 *
 * 서버가 페이지를 다 만들 때까지 화면이 멈춰 있으면 느리게 느껴진다. 실제 배치와
 * 같은 모양을 먼저 그려 두면 클릭 즉시 반응하는 것처럼 보이고, 내용이 들어올 때
 * 자리가 튀지 않는다. 스피너 하나만 두면 두 효과가 다 사라진다.
 */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-6 w-28 animate-pulse rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-9 w-24 animate-pulse rounded bg-muted" />
          <div className="h-9 w-16 animate-pulse rounded bg-muted" />
        </div>
      </div>

      <Card className="shadow-xs">
        <CardContent className="space-y-3 pt-(--card-spacing)">
          <div className="h-8 w-36 animate-pulse rounded bg-muted" />
          <div className="h-8 w-36 animate-pulse rounded bg-muted" />
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
          <div className="flex justify-end gap-2">
            <div className="h-8 w-16 animate-pulse rounded bg-muted" />
            <div className="h-8 w-16 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        <div className="flex flex-wrap gap-2">
          <div className="h-8 w-28 animate-pulse rounded bg-muted" />
          <div className="h-8 w-36 animate-pulse rounded bg-muted" />
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>

      <Card className="py-0 shadow-xs">
        <CardContent className="p-0">
          <div className="space-y-2 p-4">
            <div className="h-8 w-full animate-pulse rounded bg-muted" />
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-10 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
