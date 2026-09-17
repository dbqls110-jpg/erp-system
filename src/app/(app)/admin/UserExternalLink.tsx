"use client";

import { useEffect, useState } from "react";
import { assignStaffToUser, linkUserToExternal, searchVenuesForLink } from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type ExternalOption = { id: string; name: string };

/** 파트너·호스트 같은 외부 레벨. 연결이 비어 있으면 "내부 직원"이 아니라 "연결 안 됨"으로 보인다. */
const EXTERNAL_ROLES = new Set(["partner", "host"]);

/** 공간 호스트 검색 모드. 공간 DB 가 4천 곳이라 목록 대신 검색으로 고른다. */
const VENUE_SEARCH = "venue:__search__";

export function UserExternalLink({
  userId,
  isCurrentUser,
  role,
  partnerId,
  customerId,
  venueId,
  venueName,
  staffUserId,
  staff,
  partners,
  customers,
}: {
  userId: string;
  isCurrentUser: boolean;
  role: string;
  partnerId: string | null;
  customerId: string | null;
  venueId: string | null;
  venueName: string | null;
  /** 외부인의 담당 직원. 메신저에서 이 사람에게만 말을 걸 수 있다. */
  staffUserId: string | null;
  /** 담당 직원으로 고를 수 있는 내부 직원 목록. */
  staff: ExternalOption[];
  partners: ExternalOption[];
  customers: ExternalOption[];
}) {
  const currentValue = partnerId
    ? `partner:${partnerId}`
    : customerId
      ? `customer:${customerId}`
      : venueId
        ? `venue:${venueId}`
        : "";
  const [selectedValue, setSelectedValue] = useState(currentValue);
  const [linkedVenue, setLinkedVenue] = useState<ExternalOption | null>(venueId && venueName ? { id: venueId, name: venueName } : null);
  const [isSaving, setIsSaving] = useState(false);
  const [venueQuery, setVenueQuery] = useState("");
  const [venueHits, setVenueHits] = useState<ExternalOption[]>([]);
  const [staffValue, setStaffValue] = useState(staffUserId ?? "");
  const [staffSaving, setStaffSaving] = useState(false);
  const isExternal = Boolean(partnerId || customerId || venueId);
  const hasExternalSelection = isCurrentUser ? isExternal : selectedValue !== "" && selectedValue !== VENUE_SEARCH;
  const externalRole = EXTERNAL_ROLES.has(role);
  // 외부 레벨이거나 외부 연결이 있으면 담당 직원 칸을 보인다.
  const showStaff = externalRole || (selectedValue !== "" && selectedValue !== VENUE_SEARCH);

  const handleStaffChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    const prev = staffValue;
    setStaffValue(next);
    setStaffSaving(true);
    try {
      await assignStaffToUser(userId, next || null);
      toast.success(next ? "담당 직원을 지정했습니다." : "담당 직원을 해제했습니다.");
    } catch (err) {
      setStaffValue(prev);
      toast.error(err instanceof Error ? err.message : "변경 실패");
    } finally {
      setStaffSaving(false);
    }
  };

  // 검색어가 바뀌면 잠깐 기다렸다가 서버에 묻는다. 글자마다 묻으면 미국까지 왕복이 쌓인다.
  useEffect(() => {
    if (selectedValue !== VENUE_SEARCH) return;
    const q = venueQuery.trim();
    const timer = setTimeout(() => {
      if (q.length < 2) {
        setVenueHits([]);
        return;
      }
      searchVenuesForLink(q).then(setVenueHits).catch(() => setVenueHits([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [venueQuery, selectedValue]);

  if (isCurrentUser) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>본인</span>
        {hasExternalSelection && (
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-500">
            외부
          </Badge>
        )}
      </div>
    );
  }

  async function save(link: { partnerId?: string | null; customerId?: string | null; venueId?: string | null }) {
    setIsSaving(true);
    try {
      await linkUserToExternal(userId, link);
      toast.success("연결을 저장했습니다.");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "변경 실패");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  const handleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    const previousValue = selectedValue;
    setSelectedValue(nextValue);
    if (nextValue === VENUE_SEARCH) {
      // 공간은 검색으로 고른다. 고르기 전까지는 저장하지 않는다.
      setVenueQuery("");
      setVenueHits([]);
      return;
    }
    const link = nextValue.startsWith("partner:")
      ? { partnerId: nextValue.slice("partner:".length), customerId: null, venueId: null }
      : nextValue.startsWith("customer:")
        ? { partnerId: null, customerId: nextValue.slice("customer:".length), venueId: null }
        : nextValue.startsWith("venue:")
          ? { partnerId: null, customerId: null, venueId: nextValue.slice("venue:".length) }
          : { partnerId: null, customerId: null, venueId: null };
    if (!(await save(link))) setSelectedValue(previousValue);
    if (!link.venueId) setLinkedVenue(null);
  };

  const pickVenue = async (venue: ExternalOption) => {
    if (await save({ partnerId: null, customerId: null, venueId: venue.id })) {
      setLinkedVenue(venue);
      setSelectedValue(`venue:${venue.id}`);
      setVenueHits([]);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-2">
        <select
          value={selectedValue}
          onChange={handleChange}
          disabled={isSaving}
          className="h-9 rounded-[10px] border-border bg-input/50 px-3 text-[13px] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          aria-label="외부 연결"
        >
          {/* 파트너·호스트 레벨인데 연결이 없으면 "내부 직원"이라고 쓰면 거짓말이 된다. */}
          <option value="">{externalRole ? "연결 안 됨 — 선택하세요" : "내부 직원"}</option>
          <optgroup label="── 파트너 ──">
            {partners.map((partner) => (
              <option key={partner.id} value={`partner:${partner.id}`}>
                {partner.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="── 거래처 ──">
            {customers.map((customer) => (
              <option key={customer.id} value={`customer:${customer.id}`}>
                {customer.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="── 공간 호스트 ──">
            {linkedVenue && <option value={`venue:${linkedVenue.id}`}>{linkedVenue.name}</option>}
            <option value={VENUE_SEARCH}>공간 검색해서 연결…</option>
          </optgroup>
        </select>
        {hasExternalSelection && (
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-500">
            외부
          </Badge>
        )}
      </div>
      {showStaff && (
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          담당 직원
          <select
            value={staffValue}
            onChange={handleStaffChange}
            disabled={staffSaving}
            className={`h-8 rounded-[10px] border px-2 text-[12px] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30 ${staffValue ? "border-border bg-input/50" : "border-amber-400 bg-amber-50"}`}
            aria-label="담당 직원"
          >
            <option value="">{staffValue ? "해제" : "미지정 — 메신저 사용 불가"}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
      )}
      {selectedValue === VENUE_SEARCH && (
        <div className="relative w-64">
          <input
            autoFocus
            value={venueQuery}
            onChange={(e) => setVenueQuery(e.target.value)}
            placeholder="공간 이름 2글자 이상"
            className="h-9 w-full rounded-[10px] border border-border bg-background px-3 text-[13px] outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            aria-label="공간 검색"
          />
          {venueHits.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-[10px] border border-border bg-background py-1 shadow-md">
              {venueHits.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => pickVenue(v)}
                    disabled={isSaving}
                    className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-muted"
                  >
                    {v.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
