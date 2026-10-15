import Link from "next/link";
import { redirect } from "next/navigation";
import { getDotBrowserSession } from "@/lib/dotRequestAuth";
import { koreanDateKey } from "@/lib/dateFormat";
import DotReportForm from "./DotReportForm";

export default async function DotReportPage() {
  if (!(await getDotBrowserSession())) redirect("/dot-login");
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <h1 className="text-xl font-semibold">DOT 업무비서 · ERP 보고</h1>
    <p className="text-sm text-muted-foreground">조회와 지정 수신자 보고만 가능합니다. 업무·금액·파일 수정과 삭제는 허용되지 않습니다.</p>
    <nav className="flex flex-wrap gap-4 text-sm underline" aria-label="DOT 점검 자료">
      <Link href="/dashboard">ERP 대시보드</Link>
      <a href="/api/agent/dot/context?page=1">점검 자료 JSON (1페이지)</a>
    </nav>
    <p className="text-sm">JSON의 hasMore가 true이면 page를 1씩 늘려 모든 페이지를 확인하세요. 일일 보고는 한국시간 오전 10시 이후 하루 한 번 전송합니다.</p>
    <DotReportForm date={koreanDateKey(new Date())} />
  </main>;
}
