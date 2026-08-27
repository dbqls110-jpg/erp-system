/**
 * 캘린더 화면이 뜨기 전에 보여줄 뼈대.
 *
 * 서버가 페이지를 다 만들 때까지 화면이 멈춰 있으면 느리게 느껴진다. 실제 배치와
 * 같은 모양을 먼저 그려 두면 클릭 즉시 반응하는 것처럼 보이고, 내용이 들어올 때
 * 자리가 튀지 않는다. 스피너 하나만 두면 두 효과가 다 사라진다.
 */
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-24 bg-muted rounded-lg" />
      <div className="h-[500px] bg-muted rounded-xl" />
    </div>
  );
}
