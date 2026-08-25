"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toneBadgeClass } from "@/lib/badge-tone";
import {
  linkProjectCustomer,
  unlinkProjectCustomer,
  linkProjectPartner,
  unlinkProjectPartner,
} from "@/app/actions/partnerCustomer";

interface Option {
  id: string;
  name: string;
}

type LinkKind = "customer" | "partner";

interface Props {
  projectId: string;
  /** 이 프로젝트에 연결된 거래처 */
  customers: Option[];
  /** 이 프로젝트에 연결된 파트너 */
  partners: Option[];
  /** 선택 가능한 전체 목록 */
  allCustomers: Option[];
  allPartners: Option[];
}

interface SectionProps {
  title: string;
  items: Option[];
  options: Option[];
  kind: LinkKind;
  tone: "blue" | "violet";
  projectId: string;
  adding: LinkKind | null;
  setAdding: (next: LinkKind | null) => void;
  busy: boolean;
  run: (fn: () => Promise<void>, ok: string) => Promise<void>;
}

function Section({
  title,
  items,
  options,
  kind,
  tone,
  projectId,
  adding,
  setAdding,
  busy,
  run,
}: SectionProps) {
  const isCustomer = kind === "customer";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {options.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setAdding(adding === kind ? null : kind)}
            disabled={busy}
          >
            <Plus className="size-3.5" /> 연결
          </Button>
        )}
      </div>

      {adding === kind && (
        <select
          className="h-8 w-full rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          defaultValue=""
          disabled={busy}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            void run(
              () =>
                isCustomer
                  ? linkProjectCustomer(projectId, id)
                  : linkProjectPartner(projectId, id),
              "연결했습니다",
            );
          }}
        >
          <option value="">선택하세요…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">연결된 항목이 없습니다</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <Badge
              key={it.id}
              variant="outline"
              className={`${toneBadgeClass(tone)} gap-1 pr-1`}
            >
              {it.name}
              <button
                onClick={() =>
                  void run(
                    () =>
                      isCustomer
                        ? unlinkProjectCustomer(projectId, it.id)
                        : unlinkProjectPartner(projectId, it.id),
                    "연결을 해제했습니다",
                  )
                }
                disabled={busy}
                aria-label={`${it.name} 연결 해제`}
                className="rounded-full p-0.5 hover:bg-foreground/10"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProjectLinksPanel({
  projectId,
  customers,
  partners,
  allCustomers,
  allPartners,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<LinkKind | null>(null);

  // 이미 연결된 건 후보에서 뺀다.
  const linkedCustomerIds = new Set(customers.map((c) => c.id));
  const linkedPartnerIds = new Set(partners.map((p) => p.id));
  const customerOptions = allCustomers.filter((c) => !linkedCustomerIds.has(c.id));
  const partnerOptions = allPartners.filter((p) => !linkedPartnerIds.has(p.id));

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      setAdding(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "처리 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Section
        title="거래처"
        items={customers}
        options={customerOptions}
        kind="customer"
        tone="blue"
        projectId={projectId}
        adding={adding}
        setAdding={setAdding}
        busy={busy}
        run={run}
      />
      <Section
        title="파트너"
        items={partners}
        options={partnerOptions}
        kind="partner"
        tone="violet"
        projectId={projectId}
        adding={adding}
        setAdding={setAdding}
        busy={busy}
        run={run}
      />
    </div>
  );
}
