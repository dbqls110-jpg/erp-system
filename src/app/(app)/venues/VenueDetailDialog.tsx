"use client";

import { useEffect, useState, type ReactNode } from "react";

import { VenueMap } from "@/components/map/VenueMap";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PriceTrust = "confirmed" | "estimated" | "unreliable" | "unknown";

interface Venue {
  id: string;
  name: string;
  district: string | null;
  address: string | null;
  type: string | null;
  capacityMin: number | null;
  capacityMax: number | null;
  seats: number | null;
  areaM2: number | null;
  priceBasis: string | null;
  priceSource: string | null;
  vatType: string | null;
  baseHours: number | null;
  overAmount: number | null;
  overUnit: string | null;
  weekendSurcharge: string | null;
  commercialUse: string | null;
  saturday: string | null;
  sunday: string | null;
  holiday: string | null;
  weekdayOpen: string | null;
  weekdayClose: string | null;
  satOpen: string | null;
  satClose: string | null;
  sunOpen: string | null;
  sunClose: string | null;
  beam: string | null;
  sound: string | null;
  stage: string | null;
  lighting: string | null;
  hvac: string | null;
  parking: string | null;
  waitingRoom: string | null;
  electricity: string | null;
  restroom: string | null;
  rainPlan: string | null;
  shadeTent: string | null;
  cooking: string | null;
  noiseLimit: string | null;
  rentalItems: string | null;
  phone: string | null;
  reserveUrl: string | null;
  reserveMethod: string | null;
  lat: number | null;
  lng: number | null;
  calledAt: string | null;
  calledPrice: number | null;
  calledNote: string | null;
}

interface VenueDetailResponse {
  venue: Venue;
  price: {
    amount: number | null;
    trust: PriceTrust;
    free: boolean;
    label: string;
    warnings: string[];
  };
  groups: Array<{
    title: string;
    hint?: string;
    rows: Array<{ label: string; value: string }>;
  }>;
}

type LoadState =
  | { venueId: string | null; status: "idle" }
  | { venueId: string; status: "success"; data: VenueDetailResponse }
  | { venueId: string; status: "error"; message: string };

const TRUST_LABEL: Record<PriceTrust, string> = {
  confirmed: "확인됨",
  estimated: "추정",
  unreliable: "근거 불확실",
  unknown: "요금 미상",
};

const FACILITIES: Array<{ key: keyof Venue; label: string }> = [
  { key: "beam", label: "빔프로젝터" },
  { key: "sound", label: "음향" },
  { key: "stage", label: "무대" },
  { key: "lighting", label: "조명" },
  { key: "hvac", label: "냉난방" },
  { key: "parking", label: "주차" },
  { key: "waitingRoom", label: "대기실" },
  { key: "electricity", label: "전기" },
  { key: "restroom", label: "화장실" },
  { key: "rainPlan", label: "우천 대책" },
  { key: "shadeTent", label: "그늘막" },
  { key: "cooking", label: "취사" },
  { key: "noiseLimit", label: "소음 제한" },
  { key: "rentalItems", label: "대여 물품" },
];

const hasValue = (value: string | number | null | undefined) =>
  value !== null && value !== undefined && (typeof value !== "string" || value.trim() !== "");

const formatWon = (value: number) => `${value.toLocaleString("ko-KR")}원`;

function formatCapacity(min: number | null, max: number | null) {
  if (min !== null && max !== null) {
    return min === max ? `${min.toLocaleString("ko-KR")}명` : `${min.toLocaleString("ko-KR")}~${max.toLocaleString("ko-KR")}명`;
  }
  if (min !== null) return `최소 ${min.toLocaleString("ko-KR")}명`;
  if (max !== null) return `최대 ${max.toLocaleString("ko-KR")}명`;
  return null;
}

function formatFacility(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "y" || normalized === "가능") {
    return { label: "있음", available: true };
  }
  if (normalized === "n" || normalized === "불가" || normalized === "없음") {
    return { label: "없음", available: false };
  }
  return { label: value, available: true };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function InfoGrid({ rows }: { rows: Array<{ label: string; value: string | null }> }) {
  const visibleRows = rows.filter((row) => hasValue(row.value));
  if (visibleRows.length === 0) return null;

  return (
    <dl className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
      {visibleRows.map((row) => (
        <div key={row.label} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 text-sm">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 break-words">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function getApiError(response: Response) {
  return response
    .json()
    .then((payload: unknown) => {
      if (typeof payload === "object" && payload !== null && "error" in payload) {
        const error = payload.error;
        if (typeof error === "string" && error.trim()) return error;
      }
      return "공간 정보를 불러오지 못했습니다.";
    })
    .catch(() => "공간 정보를 불러오지 못했습니다.");
}

function ReserveInfo({ reserveMethod, reserveUrl }: { reserveMethod: string | null; reserveUrl: string | null }) {
  const online = reserveMethod === "온라인예약";

  if (online && reserveUrl) {
    return (
      <a className="text-primary underline-offset-4 hover:underline" href={reserveUrl} target="_blank" rel="noreferrer">
        온라인 예약
      </a>
    );
  }
  if (online) {
    return <span className="text-muted-foreground">온라인예약 · 주소 미상</span>;
  }
  if (reserveUrl) {
    if (reserveMethod) {
      return (
        <>
          <span className="text-muted-foreground">{reserveMethod === "확인필요" ? "확인 필요" : reserveMethod}</span>
          <span className="text-muted-foreground"> · </span>
          <a className="text-primary underline-offset-4 hover:underline" href={reserveUrl} target="_blank" rel="noreferrer">
            안내
          </a>
        </>
      );
    }
    return (
      <a className="text-primary underline-offset-4 hover:underline" href={reserveUrl} target="_blank" rel="noreferrer">
        안내 페이지
      </a>
    );
  }
  if (reserveMethod && reserveMethod !== "확인필요") {
    return <span className="text-muted-foreground">{reserveMethod}</span>;
  }
  return <span className="text-muted-foreground">확인 필요</span>;
}

export function VenueDetailDialog({
  venueId,
  onClose,
}: {
  /** null 이면 닫힌 상태 */
  venueId: string | null;
  onClose: () => void;
}) {
  const [loadState, setLoadState] = useState<LoadState>({ venueId: null, status: "idle" });

  useEffect(() => {
    if (venueId === null) return;

    const selectedVenueId = venueId;
    const controller = new AbortController();

    async function loadVenue() {
      try {
        const response = await fetch(`/api/venues/${encodeURIComponent(selectedVenueId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await getApiError(response));

        const data = (await response.json()) as VenueDetailResponse;
        if (!controller.signal.aborted) {
          setLoadState({ venueId: selectedVenueId, status: "success", data });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadState({
          venueId: selectedVenueId,
          status: "error",
          message: error instanceof Error ? error.message : "공간 정보를 불러오지 못했습니다.",
        });
      }
    }

    void loadVenue();
    return () => controller.abort();
  }, [venueId]);

  const isOpen = venueId !== null;
  const isLoading = isOpen && loadState.venueId !== venueId;
  const detail = loadState.venueId === venueId && loadState.status === "success" ? loadState.data : null;
  const error = loadState.venueId === venueId && loadState.status === "error" ? loadState.message : null;

  function handleClose() {
    setLoadState({ venueId: null, status: "idle" });
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        {isLoading && (
          <div className="space-y-2 py-8 text-center text-sm text-muted-foreground" role="status">
            <p>공간 정보를 불러오는 중입니다.</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}

        {detail && <VenueDetailContent detail={detail} />}
      </DialogContent>
    </Dialog>
  );
}

function VenueDetailContent({ detail }: { detail: VenueDetailResponse }) {
  const { venue, price, groups } = detail;
  const trustIsUncertain = price.trust === "unreliable" || price.trust === "unknown";
  const capacity = formatCapacity(venue.capacityMin, venue.capacityMax);
  const availabilityRows = [
    { label: "토요일", value: venue.saturday },
    { label: "일요일", value: venue.sunday },
    { label: "공휴일", value: venue.holiday },
    { label: "영리 사용", value: venue.commercialUse },
  ];
  const hoursRows = [
    { label: "평일", value: venue.weekdayOpen || venue.weekdayClose ? `${venue.weekdayOpen ?? ""}~${venue.weekdayClose ?? ""}` : null },
    { label: "토요일", value: venue.satOpen || venue.satClose ? `${venue.satOpen ?? ""}~${venue.satClose ?? ""}` : null },
    { label: "일요일", value: venue.sunOpen || venue.sunClose ? `${venue.sunOpen ?? ""}~${venue.sunClose ?? ""}` : null },
  ];
  const facilities = FACILITIES.flatMap(({ key, label }) => {
    const value = venue[key];
    if (typeof value !== "string" || !value.trim()) return [];
    return [{ name: label, ...formatFacility(value) }];
  });

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="text-base">{venue.name}</DialogTitle>
        <DialogDescription>
          {[venue.district, venue.type, venue.address].filter(hasValue).join(" · ")}
        </DialogDescription>
        {(venue.phone || venue.reserveMethod || venue.reserveUrl) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {venue.phone && <a className="text-primary underline-offset-4 hover:underline" href={`tel:${venue.phone}`}>{venue.phone}</a>}
            <ReserveInfo reserveMethod={venue.reserveMethod} reserveUrl={venue.reserveUrl} />
          </div>
        )}
      </DialogHeader>

      <section className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            {venue.calledPrice !== null && (
              <p className="text-sm font-medium text-primary">전화 확인: {formatWon(venue.calledPrice)}</p>
            )}
            <h3 className="text-sm font-semibold">요금</h3>
            <p className="text-2xl font-semibold tracking-tight">{price.label}</p>
          </div>
          <Badge variant={trustIsUncertain ? "destructive" : price.trust === "confirmed" ? "default" : "outline"}>
            {TRUST_LABEL[price.trust]}
          </Badge>
        </div>
        <InfoGrid
          rows={[
            { label: "요금 기준", value: venue.priceBasis },
            { label: "요금 출처", value: venue.priceSource },
            { label: "부가세", value: venue.vatType },
            { label: "기본 시간", value: venue.baseHours === null ? null : `${venue.baseHours}시간` },
            { label: "초과 금액", value: venue.overAmount === null ? null : formatWon(venue.overAmount) },
            { label: "초과 단위", value: venue.overUnit },
            { label: "주말 할증", value: venue.weekendSurcharge },
          ]}
        />
        {(venue.calledAt || venue.calledNote) && (
          <div className="rounded-md bg-muted/50 p-2 text-sm text-muted-foreground">
            {venue.calledAt && <p>통화일: {venue.calledAt}</p>}
            {venue.calledNote && <p>전화 메모: {venue.calledNote}</p>}
          </div>
        )}
        {price.warnings.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
            {price.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
      </section>

      {capacity || hasValue(venue.seats) || hasValue(venue.areaM2) ? (
        <Section title="정원·면적">
          <InfoGrid
            rows={[
              { label: "수용 인원", value: capacity },
              { label: "좌석 수", value: venue.seats === null ? null : `${venue.seats.toLocaleString("ko-KR")}석` },
              { label: "면적", value: venue.areaM2 === null ? null : `${venue.areaM2.toLocaleString("ko-KR")}㎡` },
            ]}
          />
        </Section>
      ) : null}

      {availabilityRows.some((row) => hasValue(row.value)) && (
        <Section title="대관 가능 여부">
          <InfoGrid rows={availabilityRows} />
        </Section>
      )}

      {hoursRows.some((row) => hasValue(row.value)) && (
        <Section title="운영 시간">
          <InfoGrid rows={hoursRows} />
        </Section>
      )}

      {facilities.length > 0 && (
        <Section title="시설">
          <dl className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
            {facilities.map((facility) => (
              <div key={facility.name} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 text-sm">
                <dt className="text-muted-foreground">{facility.name}</dt>
                <dd className={facility.available ? "text-foreground" : "text-muted-foreground"}>{facility.label}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {groups.length > 0 && (
        <Section title="상세 근거">
          <div className="space-y-2">
            {groups.map((group, index) => (
              <details key={`${group.title}-${index}`} open={index === 0} className="rounded-lg border border-border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{group.title}</summary>
                {group.hint && <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{group.hint}</p>}
                <div className="overflow-x-auto border-t border-border">
                  <Table className="min-w-[36rem]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>항목</TableHead>
                        <TableHead>내용</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((row, rowIndex) => (
                        <TableRow key={`${row.label}-${rowIndex}`}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{row.label}</TableCell>
                          <TableCell>{row.value}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </details>
            ))}
          </div>
        </Section>
      )}

      {venue.lat !== null && venue.lng !== null && (
        <Section title="지도">
          <VenueMap pins={[{ id: venue.id, name: venue.name, lat: venue.lat, lng: venue.lng }]} />
        </Section>
      )}
    </div>
  );
}
