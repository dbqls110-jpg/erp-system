"use client";

import { Fragment, useRef, useState } from "react";

import { VenueMap } from "@/components/map/VenueMap";
import { VenueDetailDialog } from "./VenueDetailDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MatchQuery } from "@/lib/venueMatch";

type DayOfWeek = NonNullable<MatchQuery["dayOfWeek"]>;

interface FormState {
  name: string;
  people: string;
  budget: string;
  hours: string;
  dayOfWeek: "" | DayOfWeek;
  district: string;
  type: string;
  parking: boolean;
  hvac: boolean;
  beam: boolean;
  sound: boolean;
  commercial: boolean;
}

interface CandidateVenue {
  id: string;
  name: string;
  district: string | null;
  type: string | null;
  capacityMin: number | null;
  capacityMax: number | null;
  phone: string | null;
  reserveUrl: string | null;
  reserveMethod: string | null;
  lat: number | null;
  lng: number | null;
}

/** 요금을 어떻게 읽었는지. 서버(@/lib/venuePrice)가 판단해서 내려준다. */
interface ResolvedPriceView {
  label: string;
  trust: "confirmed" | "estimated" | "unreliable" | "unknown";
  free: boolean;
}

interface SearchResult {
  candidates: Array<{
    venue: CandidateVenue;
    score: number;
    warnings: string[];
    estimate: number | null;
    price: ResolvedPriceView;
  }>;
  blockedCount: number;
  total: number;
  offset: number;
  limit: number;
}

interface VenueSearchProps {
  districts: string[];
  venueTypes: string[];
}

const PAGE_SIZE = 20;

const initialForm: FormState = {
  name: "",
  people: "",
  budget: "",
  hours: "",
  dayOfWeek: "",
  district: "전체",
  type: "전체",
  parking: false,
  hvac: false,
  beam: false,
  sound: false,
  commercial: false,
};

function numberOrUndefined(value: string) {
  if (!value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function displayValue(value: string | null | undefined) {
  return value?.trim() ? value : "미상";
}

function displayCapacity(min: number | null, max: number | null) {
  if (min === null && max === null) return "미상";
  if (min !== null && max !== null && min !== max) return `${min.toLocaleString()}~${max.toLocaleString()}명`;
  return `${(max ?? min)!.toLocaleString()}명`;
}

/**
 * 요금 신뢰도를 사람 말로.
 *
 * "추정" 한 마디로 뭉뚱그렸더니 ㎡당 단가를 총액으로 읽은 13원짜리와, 근거를 확인한
 * 40만원짜리가 화면에서 똑같아 보였다. 얼마나 믿을 수 있는지는 금액만큼 중요하다.
 */
const TRUST_LABEL: Record<ResolvedPriceView["trust"], string> = {
  confirmed: "확인",
  estimated: "추정",
  unreliable: "근거 불확실",
  unknown: "요금 미상",
};

function trustClass(trust: ResolvedPriceView["trust"]) {
  return trust === "unreliable"
    ? "text-destructive"
    : trust === "confirmed"
      ? "text-foreground"
      : "text-muted-foreground";
}

/**
 * 신청 방법.
 *
 * 예약 URL 이 있는 3,414곳 중 1,712곳이 실제로는 전화로만 받는다. 전부 "예약" 링크로
 * 보여 주면 눌러 봐야 예약이 안 되는 안내 페이지가 열린다. 그래서 접수 방법과
 * 안내 페이지를 나눠 보여 준다 — 링크가 없어지는 것이 아니라 무엇인지 밝히는 것이다.
 *
 * 온라인예약인데 주소를 모르는 곳도 67곳 있다. 그냥 "온라인예약" 이라고만 두면
 * 눌러 보고 왜 안 눌리는지 묻게 된다.
 */
function ReserveCell({ venue }: { venue: CandidateVenue }) {
  const method = venue.reserveMethod;
  const online = method === "온라인예약";

  if (online && venue.reserveUrl) {
    return (
      <a href={venue.reserveUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
        온라인 예약
      </a>
    );
  }
  if (online) {
    return <span className="text-muted-foreground">온라인예약 · 주소 미상</span>;
  }
  if (venue.reserveUrl) {
    if (method) {
      return (
        <>
          <span className="text-muted-foreground">{method === "확인필요" ? "확인 필요" : method}</span>
          <span className="text-muted-foreground"> · </span>
          <a href={venue.reserveUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            안내
          </a>
        </>
      );
    }
    return (
      <a href={venue.reserveUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
        안내 페이지
      </a>
    );
  }
  if (method && method !== "확인필요") {
    return <span className="text-muted-foreground">{method}</span>;
  }
  return <span className="text-muted-foreground">확인 필요</span>;
}

export function VenueSearch({ districts, venueTypes }: VenueSearchProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openVenueId, setOpenVenueId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  function setField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  /**
   * offset 을 인자로 받는다.
   *
   * form 을 고쳐 다시 검색하는 것과 다음 장으로 넘어가는 것은 다른 일이다. 페이지
   * 번호를 상태로 두면 조건을 바꿨을 때 3페이지에 머문 채 결과가 갈리는 일이 생긴다.
   */
  async function search(offset = 0) {
    const body: Record<string, unknown> = {
      needs: {
        parking: form.parking,
        hvac: form.hvac,
        beam: form.beam,
        sound: form.sound,
      },
      commercial: form.commercial,
      limit: PAGE_SIZE,
      offset,
    };

    const people = numberOrUndefined(form.people);
    const budget = numberOrUndefined(form.budget);
    const hours = numberOrUndefined(form.hours);
    if (form.name.trim()) body.name = form.name.trim();
    if (people !== undefined) body.people = people;
    if (budget !== undefined) body.budget = budget;
    if (hours !== undefined) body.hours = hours;
    if (form.dayOfWeek) body.dayOfWeek = form.dayOfWeek;
    if (form.district !== "전체") body.district = form.district;
    if (form.type !== "전체") body.type = form.type;

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/venues/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as SearchResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "검색하지 못했습니다.");
      setResult(payload);
      // 다음 장으로 넘어가면 표 위쪽이 화면 밖에 있다. 목록 맨 위로 올려 준다.
      if (offset > 0) tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (searchError) {
      setResult(null);
      setError(searchError instanceof Error ? searchError.message : "검색하지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  function reset() {
    setForm(initialForm);
    setResult(null);
    setError(null);
  }

  const pins = result?.candidates.flatMap(({ venue }) => {
    if (venue.lat === null || venue.lng === null) return [];
    return [{ id: venue.id, name: venue.name, lat: venue.lat, lng: venue.lng }];
  }) ?? [];

  return (
    <div className="space-y-4">
      <div>
        <p className="mt-1 text-sm text-muted-foreground">문의 조건에 맞는 대관 공간 후보를 찾아보세요</p>
      </div>

      <Card className="shadow-xs">
        <CardContent className="space-y-4 pt-(--card-spacing)">
          <label className="block space-y-1.5 text-sm">
            <span className="block text-muted-foreground">공간명</span>
            <Input
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void search(0);
              }}
              placeholder="예: 구로구민회관 · 아트홀 (일부만 입력해도 됩니다)"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1.5 text-sm">
              <span className="block text-muted-foreground">인원</span>
              <Input type="number" min="1" value={form.people} onChange={(event) => setField("people", event.target.value)} placeholder="예: 100" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="block text-muted-foreground">예산(원)</span>
              <Input type="number" min="1" step="10000" value={form.budget} onChange={(event) => setField("budget", event.target.value)} placeholder="예: 1000000" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="block text-muted-foreground">필요 시간(시간)</span>
              <Input type="number" min="1" step="0.5" value={form.hours} onChange={(event) => setField("hours", event.target.value)} placeholder="예: 4" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="block text-muted-foreground">희망 요일</span>
              <select value={form.dayOfWeek} onChange={(event) => setField("dayOfWeek", event.target.value as FormState["dayOfWeek"])} className="h-9 w-full rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
                <option value="">선택 안 함</option>
                <option value="평일">평일</option>
                <option value="토">토</option>
                <option value="일">일</option>
                <option value="공휴일">공휴일</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="block text-muted-foreground">지역(자치구)</span>
              <select value={form.district} onChange={(event) => setField("district", event.target.value)} className="h-9 w-full rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
                <option value="전체">전체</option>
                {districts.map((district) => <option key={district} value={district}>{district}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="block text-muted-foreground">유형</span>
              <select value={form.type} onChange={(event) => setField("type", event.target.value)} className="h-9 w-full rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
                <option value="전체">전체</option>
                {venueTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {([
              ["parking", "주차 필요"],
              ["hvac", "냉난방 필요"],
              ["beam", "빔 필요"],
              ["sound", "음향 필요"],
              ["commercial", "영리 목적 행사"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2">
                <input type="checkbox" checked={form[key]} onChange={(event) => setField(key, event.target.checked)} className="size-4 rounded border-border accent-primary" />
                {label}
              </label>
            ))}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={reset}>초기화</Button>
            <Button type="button" onClick={() => void search(0)} disabled={isLoading}>
              {isLoading ? "검색 중..." : "검색"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </CardContent>
      </Card>

      {result && (
        <p className="text-sm">
          후보 <span className="font-semibold text-primary">{result.total.toLocaleString()}</span>곳 · 조건에 안 맞아 제외{" "}
          <span className="font-semibold">{result.blockedCount.toLocaleString()}</span>곳
          {result.total > 0 && (
            // 3,721곳이라고만 적어 두고 20줄만 보여 주면 나머지가 어디 갔는지 알 수 없다.
            <span className="text-muted-foreground">
              {" · "}
              {(result.offset + 1).toLocaleString()}~
              {Math.min(result.offset + result.limit, result.total).toLocaleString()}번째 표시
            </span>
          )}
        </p>
      )}

      <Card ref={tableRef} className="py-0 shadow-xs">
        <CardContent className="p-0">
          <div className="space-y-2 p-3 md:hidden">
            {!result ? (
              <p className="py-10 text-center text-sm text-muted-foreground">검색 조건을 입력하고 검색하세요.</p>
            ) : result.candidates.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">조건에 맞는 후보가 없습니다.</p>
            ) : result.candidates.map(({ venue, warnings, price }) => (
              <article key={venue.id} className="rounded-xl border border-border p-3">
                <button type="button" onClick={() => setOpenVenueId(venue.id)} className="font-medium text-left hover:text-primary hover:underline">{displayValue(venue.name)}</button>
                <p className="mt-1 text-xs text-muted-foreground">{displayValue(venue.district)} · {displayValue(venue.type)} · {displayCapacity(venue.capacityMin, venue.capacityMax)}</p>
                <p className="mt-2 text-sm"><span className={trustClass(price.trust)}>{price.label}</span>{!price.free && <span className="ml-1 text-xs text-muted-foreground">({TRUST_LABEL[price.trust]})</span>}</p>
                <div className="mt-2 text-xs text-muted-foreground">{venue.phone ? <a href={`tel:${venue.phone.replace(/[^\d+]/g, "")}`} className="hover:text-primary">{venue.phone}</a> : "연락처 미상"} · <ReserveCell venue={venue} /></div>
                {warnings.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{warnings.join(" · ")}</p>}
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <p className="mb-2 text-xs text-muted-foreground md:hidden">표를 좌우로 밀어 더 많은 열을 볼 수 있습니다.</p>
            <Table className="mx-auto w-auto table-auto [&_:is(th,td)]:px-4 [&_:is(th,td)]:py-3">
              <TableHeader>
                <TableRow>
                  {/* 공간명은 긴 이름이 들어올 수 있어 남는 폭을 맡긴다. */}
                  <TableHead className="w-full whitespace-nowrap">공간명</TableHead>
                  <TableHead className="whitespace-nowrap">자치구</TableHead>
                  <TableHead className="whitespace-nowrap">유형</TableHead>
                  <TableHead className="whitespace-nowrap text-right">정원</TableHead>
                  <TableHead className="whitespace-nowrap text-right">요금 (4시간 기준)</TableHead>
                  <TableHead className="whitespace-nowrap">전화</TableHead>
                  <TableHead className="whitespace-nowrap">신청 방법</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!result ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">검색 조건을 입력하고 검색하세요.</TableCell>
                  </TableRow>
                ) : result.candidates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">조건에 맞는 후보가 없습니다. 제외 사유를 확인하거나 조건을 완화해 보세요.</TableCell>
                  </TableRow>
                ) : (
                  result.candidates.map(({ venue, warnings, price }) => (
                    <Fragment key={venue.id}>
                      <TableRow>
                        <TableCell className="font-medium">
                          <button
                            type="button"
                            onClick={() => setOpenVenueId(venue.id)}
                            className="text-left hover:text-primary hover:underline"
                          >
                            {displayValue(venue.name)}
                          </button>
                        </TableCell>
                        <TableCell>{displayValue(venue.district)}</TableCell>
                        <TableCell>{displayValue(venue.type)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">{displayCapacity(venue.capacityMin, venue.capacityMax)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          <span className={trustClass(price.trust)}>{price.label}</span>
                          {!price.free && (
                            <span className="ml-1 text-xs text-muted-foreground">({TRUST_LABEL[price.trust]})</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {venue.phone ? <a href={`tel:${venue.phone.replace(/[^\d+]/g, "")}`} className="hover:text-primary">{venue.phone}</a> : "미상"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <ReserveCell venue={venue} />
                        </TableCell>
                      </TableRow>
                      {warnings.length > 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="border-0 py-1.5 text-xs text-muted-foreground">{warnings.join(" · ")}</TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {result && result.total > result.limit && (
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={result.offset === 0 || isLoading}
            onClick={() => void search(Math.max(0, result.offset - result.limit))}
          >
            이전
          </Button>
          <span className="text-sm text-muted-foreground">
            {Math.floor(result.offset / result.limit) + 1} / {Math.ceil(result.total / result.limit)} 쪽
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={result.offset + result.limit >= result.total || isLoading}
            onClick={() => void search(result.offset + result.limit)}
          >
            다음
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">지도</h2>
        <VenueMap pins={pins} />
      </div>

      <VenueDetailDialog venueId={openVenueId} onClose={() => setOpenVenueId(null)} />
    </div>
  );
}
