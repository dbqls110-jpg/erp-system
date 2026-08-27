/**
 * 명함 관리 화면이 뜨기 전에 보여줄 뼈대.
 *
 * 서버가 페이지를 다 만들 때까지 화면이 멈춰 있으면 느리게 느껴진다. 실제 배치와
 * 같은 모양을 먼저 그려 두면 클릭 즉시 반응하는 것처럼 보이고, 내용이 들어올 때
 * 자리가 튀지 않는다. 스피너 하나만 두면 두 효과가 다 사라진다.
 */
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-28 bg-muted rounded-lg" />
      <div className="h-10 bg-muted rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-36 bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}
