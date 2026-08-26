"use client";

import { Fragment, useState } from "react";

import { VenueMap } from "@/components/map/VenueMap";
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
  lat: number | null;
  lng: number | null;
}

interface SearchResult {
  candidates: Array<{
    venue: CandidateVenue;
    score: number;
    warnings: string[];
    estimate: number | null;
  }>;
  blockedCount: number;
  total: number;
}

interface VenueSearchProps {
  districts: string[];
  venueTypes: string[];
}

const initialForm: FormState = {
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

function displayEstimate(estimate: number | null) {
  return estimate === null ? "미상" : `${estimate.toLocaleString()}원 (추정)`;
}

export function VenueSearch({ districts, venueTypes }: VenueSearchProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function search() {
    const body: Record<string, unknown> = {
      needs: {
        parking: form.parking,
        hvac: form.hvac,
        beam: form.beam,
        sound: form.sound,
      },
      commercial: form.commercial,
      limit: 20,
    };

    const people = numberOrUndefined(form.people);
    const budget = numberOrUndefined(form.budget);
    const hours = numberOrUndefined(form.hours);
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
            <Button type="button" onClick={() => void search()} disabled={isLoading}>
              {isLoading ? "검색 중..." : "검색"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </CardContent>
      </Card>

      {result && (
        <p className="text-sm">
          후보 <span className="font-semibold text-primary">{result.total}</span>곳 · 조건에 안 맞아 제외 <span className="font-semibold">{result.blockedCount}</span>곳
        </p>
      )}

      <Card className="py-0 shadow-xs">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="[&_:is(th,td)]:px-4">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">공간명</TableHead>
                  <TableHead className="whitespace-nowrap">자치구</TableHead>
                  <TableHead className="whitespace-nowrap">유형</TableHead>
                  <TableHead className="whitespace-nowrap">정원</TableHead>
                  <TableHead className="whitespace-nowrap">추정 총액</TableHead>
                  <TableHead className="whitespace-nowrap">전화</TableHead>
                  <TableHead className="whitespace-nowrap">예약</TableHead>
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
                  result.candidates.map(({ venue, warnings, estimate }) => (
                    <Fragment key={venue.id}>
                      <TableRow>
                        <TableCell className="font-medium">{displayValue(venue.name)}</TableCell>
                        <TableCell>{displayValue(venue.district)}</TableCell>
                        <TableCell>{displayValue(venue.type)}</TableCell>
                        <TableCell className="whitespace-nowrap">{displayCapacity(venue.capacityMin, venue.capacityMax)}</TableCell>
                        <TableCell className="whitespace-nowrap">{displayEstimate(estimate)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {venue.phone ? <a href={`tel:${venue.phone.replace(/[^\d+]/g, "")}`} className="hover:text-primary">{venue.phone}</a> : "미상"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {venue.reserveUrl ? <a href={venue.reserveUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">예약</a> : "미상"}
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

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">지도</h2>
        <VenueMap pins={pins} />
      </div>
    </div>
  );
}
