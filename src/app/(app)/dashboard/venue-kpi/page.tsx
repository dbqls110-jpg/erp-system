import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, MapPinned } from "lucide-react";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { requireMenuAccess } from "@/lib/permissions";
import { getVenueWeekRange, shiftVenueWeek } from "@/lib/venueKpi";
import { getHostRegisteredSpacesForWeek, hostRegisteredSpaceSheetRowUrl } from "@/lib/spaceDatabaseSync";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageIntro } from "@/components/ui/page-intro";
import { EmptyState } from "@/components/ui/empty-state";

function validWeek(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", weekday: "short", timeZone: "Asia/Seoul" }).format(value);
}

export default async function VenueKpiPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  await requireMenuAccess(session.user.id, "venues", session.user.role);

  const params = await searchParams;
  const requested = validWeek(params.week);
  const range = getVenueWeekRange(requested ?? new Date());
  const spaces = await getHostRegisteredSpacesForWeek(range.startDate, range.endDate).catch(() => null);
  const previousWeek = shiftVenueWeek(range.startDate, -1);
  const nextWeek = shiftVenueWeek(range.startDate, 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="대시보드로 돌아가기">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <PageIntro>주간 공간 등록</PageIntro>
          <p className="mt-1 text-[13px] text-muted-foreground">호스트 등록 공간 시트의 등록일시를 기준으로 이번 주에 새로 추가한 공간만 집계합니다.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-3">
        <Card><CardHeader><CardDescription>이번 주 신규 등록</CardDescription><CardTitle className="text-3xl tabular-nums">{spaces ? `${spaces.length}건` : "확인 불가"}</CardTitle><p className="text-xs text-muted-foreground">{formatDate(range.start)} ~ {formatDate(new Date(range.endExclusive.getTime() - 24 * 60 * 60 * 1000))}</p></CardHeader></Card>
        <Card className="@xl/main:col-span-2"><CardHeader><CardDescription>집계 기준</CardDescription><CardTitle className="text-xl">호스트 등록 공간 시트</CardTitle><p className="text-xs text-muted-foreground">등록일시 (한국시간)가 해당 주에 해당하는 행만 표시합니다. 기존 ERP 공간 DB 자료는 소급 집계하지 않습니다.</p></CardHeader></Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border">
          <div><CardTitle className="text-base">이번 주 추가한 공간</CardTitle><CardDescription>실제 공간명, 주소와 원본 시트 행을 확인할 수 있습니다.</CardDescription></div>
          <div className="flex items-center gap-1 text-sm">
            <Link href={`/dashboard/venue-kpi?week=${previousWeek}`} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="이전 주"><ChevronLeft size={17} /></Link>
            <span className="min-w-[112px] text-center font-medium tabular-nums">{range.startDate.slice(5)} ~ {range.endDate.slice(5)}</span>
            <Link href={`/dashboard/venue-kpi?week=${nextWeek}`} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="다음 주"><ChevronRight size={17} /></Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {spaces === null ? (
            <div className="px-6 py-14 text-center"><EmptyState icon={<MapPinned className="size-5" />}>호스트 등록 공간 시트를 읽지 못했습니다. Google 시트 연결과 필수 열을 확인해 주세요.</EmptyState></div>
          ) : spaces.length === 0 ? (
            <div className="px-6 py-14 text-center"><EmptyState icon={<MapPinned className="size-5" />}>이 주에 새로 추가된 공간이 없습니다.</EmptyState></div>
          ) : (
            <div className="divide-y divide-border">
              {spaces.map((space) => (
                <div key={`${space.sheetRowNumber}-${space.registrationNumber}`} className="flex flex-col gap-3 px-5 py-4 @md/main:flex-row @md/main:items-center @md/main:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{space.registrationNumber ? `${space.registrationNumber} · ` : ""}{space.spaceName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{space.address || "주소 미상"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">시트 등록일시 {space.registeredAt}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <a href={hostRegisteredSpaceSheetRowUrl(space.sheetRowNumber)} target="_blank" rel="noreferrer" className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">시트 행 열기</a>
                    {space.spacePage && <a href={space.spacePage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-muted">공간 페이지 <ExternalLink size={12} /></a>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
