import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, MapPinned } from "lucide-react";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireMenuAccess } from "@/lib/permissions";
import { getVenueWeekRange, shiftVenueWeek } from "@/lib/venueKpi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageIntro } from "@/components/ui/page-intro";
import { EmptyState } from "@/components/ui/empty-state";

function validWeek(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", weekday: "short" }).format(value);
}

export default async function VenueKpiPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  await requireMenuAccess(session.user.id, "venues", session.user.role);

  const params = await searchParams;
  const requested = validWeek(params.week);
  const range = getVenueWeekRange(requested ?? new Date());
  const owner = await prisma.user.findFirst({
    where: { name: "이석준", active: true, role: { not: "pending" } },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  const venues = owner
    ? await prisma.venue.findMany({
        where: { createdById: owner.id, createdAt: { gte: range.start, lt: range.endExclusive } },
        select: { id: true, name: true, address: true, reserveUrl: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const previousWeek = shiftVenueWeek(range.startDate, -1);
  const nextWeek = shiftVenueWeek(range.startDate, 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="대시보드로 돌아가기">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <PageIntro>이석준의 주간 공간 등록</PageIntro>
          <p className="mt-1 text-[13px] text-muted-foreground">ERP DB에 이석준이 등록한 공간을 주 단위로 집계합니다.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-3">
        <Card><CardHeader><CardDescription>등록 공간</CardDescription><CardTitle className="text-3xl tabular-nums">{venues.length}건</CardTitle><p className="text-xs text-muted-foreground">{formatDate(range.start)} ~ {formatDate(new Date(range.endExclusive.getTime() - 24 * 60 * 60 * 1000))}</p></CardHeader></Card>
        <Card className="@xl/main:col-span-2"><CardHeader><CardDescription>담당자</CardDescription><CardTitle className="text-xl">{owner?.name ?? "이석준 계정 없음"}</CardTitle><p className="text-xs text-muted-foreground">{owner?.email ?? "관리자에서 이석준 계정을 먼저 확인해 주세요."}</p></CardHeader></Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border">
          <div><CardTitle className="text-base">등록한 공간 목록</CardTitle><CardDescription>공간명, 주소, 예약 링크를 확인할 수 있습니다.</CardDescription></div>
          <div className="flex items-center gap-1 text-sm">
            <Link href={`/dashboard/venue-kpi?week=${previousWeek}`} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="이전 주"><ChevronLeft size={17} /></Link>
            <span className="min-w-[112px] text-center font-medium tabular-nums">{range.startDate.slice(5)} ~ {range.endDate.slice(5)}</span>
            <Link href={`/dashboard/venue-kpi?week=${nextWeek}`} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="다음 주"><ChevronRight size={17} /></Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {venues.length === 0 ? (
            <div className="px-6 py-14 text-center"><EmptyState icon={<MapPinned className="size-5" />}>이 기간에 등록한 공간이 없습니다.</EmptyState></div>
          ) : (
            <div className="divide-y divide-border">
              {venues.map((venue) => (
                <div key={venue.id} className="flex flex-col gap-3 px-5 py-4 @md/main:flex-row @md/main:items-center @md/main:justify-between">
                  <div className="min-w-0">
                    <Link href={`/venues?ids=${encodeURIComponent(venue.id)}`} className="font-semibold text-foreground hover:text-primary hover:underline">{venue.name}</Link>
                    <p className="mt-1 text-sm text-muted-foreground">{venue.address ?? "주소 미상"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">등록일 {formatDate(new Date(venue.createdAt))}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link href={`/venues?ids=${encodeURIComponent(venue.id)}`} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">공간 DB에서 열기</Link>
                    {venue.reserveUrl && <a href={venue.reserveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-muted">링크 <ExternalLink size={12} /></a>}
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
