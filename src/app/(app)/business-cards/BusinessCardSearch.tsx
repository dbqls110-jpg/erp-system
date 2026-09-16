"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CardDeleteButton } from "./CardDeleteButton";
import { formatKoreanShortDate } from "@/lib/dateFormat";
import { Phone, Mail, MapPin, Building, Briefcase, Search, CreditCard } from "lucide-react";

interface BusinessCard {
  id: string;
  name: string;
  company: string | null;
  jobTitle: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  createdAt: Date | string;
  user: { name: string | null };
}

export function BusinessCardSearch({ cards, isAdmin }: { cards: BusinessCard[]; isAdmin: boolean }) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? cards.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.company?.toLowerCase().includes(q) ?? false) ||
          (c.phone?.replace(/\D/g, "").includes(q.replace(/\D/g, "")) ?? false) ||
          (c.email?.toLowerCase().includes(q) ?? false)
        );
      })
    : cards;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="이름, 회사, 연락처, 이메일로 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={<CreditCard className="size-5" />}>
              {query ? `"${query}"에 해당하는 명함이 없습니다` : "등록된 명함이 없습니다"}
              <p className="mt-1">{query ? "다른 검색어를 입력해 보세요" : "명함 등록 버튼으로 추가하세요"}</p>
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
        <>
          {query && (
            <p className="text-[13px] text-muted-foreground">{filtered.length}건 검색됨</p>
          )}
          <Card>
            <CardContent className="p-0">
              <div className="space-y-2 p-4 md:hidden">
                {filtered.map((c) => (
                  <article key={c.id} className="rounded-[12px] border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-semibold text-foreground" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>{c.name}</p>
                        {c.jobTitle && <p className="flex items-center gap-1 text-[13px] text-muted-foreground"><Briefcase size={12} /> {c.jobTitle}</p>}
                        {c.company && <p className="flex items-center gap-1 text-[13px] text-foreground"><Building size={12} /> {c.company}</p>}
                        {c.phone && <p className="flex items-center gap-1 text-[13px] text-muted-foreground"><Phone size={12} /> {c.phone}</p>}
                        {c.email && <p className="flex items-center gap-1 truncate text-[13px] text-muted-foreground"><Mail size={12} /> {c.email}</p>}
                        {c.address && <p className="flex items-center gap-1 text-[12px] text-muted-foreground"><MapPin size={11} /> {c.address}</p>}
                      </div>
                      {isAdmin && <CardDeleteButton id={c.id} name={c.name} />}
                    </div>
                    <p className="mt-3 border-t border-border pt-3 text-[12px] text-muted-foreground">등록자: {c.user.name} · {formatKoreanShortDate(c.createdAt)}</p>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table className="min-w-[860px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>이름</TableHead>
                      <TableHead>회사</TableHead>
                      <TableHead>직함</TableHead>
                      <TableHead>연락처</TableHead>
                      <TableHead>이메일</TableHead>
                      <TableHead>주소</TableHead>
                      <TableHead>등록자 · 등록일</TableHead>
                      {isAdmin && <TableHead>관리</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.company ?? "-"}</TableCell>
                        <TableCell>{c.jobTitle ?? "-"}</TableCell>
                        <TableCell className="tabular-nums">{c.phone ?? "-"}</TableCell>
                        <TableCell>{c.email ?? "-"}</TableCell>
                        <TableCell>{c.address ?? "-"}</TableCell>
                        <TableCell>{c.user.name ?? "-"} · {formatKoreanShortDate(c.createdAt)}</TableCell>
                        {isAdmin && <TableCell><CardDeleteButton id={c.id} name={c.name} /></TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
