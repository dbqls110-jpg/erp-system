import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** 메뉴 전환 중 빈 화면으로 보이지 않도록 공통 로딩 상태를 제공한다. */
export default function AppLoading() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label="화면을 불러오는 중">
      <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-muted" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Card key={item} className="shadow-xs">
            <CardHeader>
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-8 w-32 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="shadow-xs">
        <CardContent className="space-y-3 p-6">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
      <span className="sr-only">화면을 불러오는 중입니다.</span>
    </div>
  );
}
