"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CardDeleteButton } from "./CardDeleteButton";
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
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-smoke-gray" />
        <Input
          placeholder="이름, 회사, 연락처, 이메일로 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 border-ash-gray text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="border-ash-gray">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <CreditCard size={40} className="text-ash-gray" />
            <p className="text-sm font-medium text-midnight-charcoal">
              {query ? `"${query}"에 해당하는 명함이 없습니다` : "등록된 명함이 없습니다"}
            </p>
            <p className="text-xs text-smoke-gray">
              {query ? "다른 검색어를 입력해 보세요" : "명함 등록 버튼으로 추가하세요"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {query && (
            <p className="text-xs text-smoke-gray">{filtered.length}건 검색됨</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((c) => (
              <Card key={c.id} className="border-ash-gray shadow-[var(--shadow-sm)]">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
                        {c.name}
                      </p>
                      {c.jobTitle && (
                        <p className="text-sm text-smoke-gray flex items-center gap-1">
                          <Briefcase size={12} /> {c.jobTitle}
                        </p>
                      )}
                      {c.company && (
                        <p className="text-sm text-midnight-charcoal flex items-center gap-1">
                          <Building size={12} /> {c.company}
                        </p>
                      )}
                      {c.phone && (
                        <p className="text-sm text-smoke-gray flex items-center gap-1">
                          <Phone size={12} /> {c.phone}
                        </p>
                      )}
                      {c.email && (
                        <p className="text-sm text-smoke-gray flex items-center gap-1 truncate">
                          <Mail size={12} /> {c.email}
                        </p>
                      )}
                      {c.address && (
                        <p className="text-xs text-smoke-gray flex items-center gap-1">
                          <MapPin size={11} /> {c.address}
                        </p>
                      )}
                    </div>
                    {isAdmin && <CardDeleteButton id={c.id} name={c.name} />}
                  </div>
                  <p className="text-xs text-smoke-gray mt-2 border-t border-ash-gray pt-2">
                    등록자: {c.user.name} · {new Date(c.createdAt).toLocaleDateString("ko-KR")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
