import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { requireMenuAccess } from "@/lib/permissions";
import { Building2, Download, Plus, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toneBadgeClass } from "@/lib/badge-tone";
import { prisma } from "@/lib/prisma";

type CustomerSearchParams = Promise<Record<string, string | string[] | undefined>>;

const CATEGORY_BY_QUERY = { customer: "고객사", partner: "협력사", supplier: "공급사" } as const;
const STATUS_BY_QUERY = { active: "거래중", pending: "보류", closed: "종료" } as const;

export default async function CustomersPage({ searchParams }: { searchParams?: CustomerSearchParams }) {
  const session = await getServerSession(authOptions);
  await requireMenuAccess(session!.user.id, "customers", session!.user.role);

  const params = await searchParams;
  const categoryParam = typeof params?.category === "string" ? params.category : "all";
  const statusParam = typeof params?.status === "string" ? params.status : "all";
  const keyword = typeof params?.q === "string" ? params.q.trim() : "";
  const category = CATEGORY_BY_QUERY[categoryParam as keyof typeof CATEGORY_BY_QUERY];
  const status = STATUS_BY_QUERY[statusParam as keyof typeof STATUS_BY_QUERY];
  const where: Prisma.CustomerWhereInput = {};

  if (category) where.category = category;
  if (status) where.status = status;
  if (keyword) {
    where.OR = [
      { name: { contains: keyword, mode: "insensitive" } },
      { manager: { contains: keyword, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.customer.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { projects: { include: { project: { select: { id: true, name: true } } } } },
  });
  const hasFilters = Boolean(keyword || category || status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">고객·협력사 정보</p>
        <div className="flex gap-2">
          <a href="/customers" className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
            <RefreshCw className="size-3.5" /> 새로고침
          </a>
          <Button className="h-9 py-2"><Plus className="size-3.5" /> 등록</Button>
        </div>
      </div>

      <Card className="shadow-xs">
        <CardContent className="pt-(--card-spacing)">
          <form method="get" className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="customer-category" className="w-20 shrink-0 text-sm text-muted-foreground">분류</label>
              <select id="customer-category" name="category" defaultValue={categoryParam} className="h-8 w-36 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
                <option value="all">전체</option><option value="customer">고객사</option><option value="partner">협력사</option><option value="supplier">공급사</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="customer-status" className="w-20 shrink-0 text-sm text-muted-foreground">상태</label>
              <select id="customer-status" name="status" defaultValue={statusParam} className="h-8 w-36 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
                <option value="all">전체</option><option value="active">거래중</option><option value="pending">보류</option><option value="closed">종료</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="customer-keyword" className="w-20 shrink-0 text-sm text-muted-foreground">검색 키워드</label>
              <Input id="customer-keyword" name="q" defaultValue={keyword} className="h-8 w-64" placeholder="회사명, 담당자 검색" />
            </div>
            <div className="flex justify-end gap-2">
              <a href="/customers" className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">초기화</a>
              <Button type="submit" className="h-8">조회</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">총 <span className="font-semibold text-primary">{rows.length}</span>건</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-8"><Download className="size-3.5" /> 엑셀 다운로드</Button>
          <select defaultValue="updated" aria-label="정렬" className="h-8 w-36 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground"><option value="updated">최종수정일순</option><option value="name">회사명순</option></select>
          <select defaultValue="10" aria-label="페이지 크기" className="h-8 w-28 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground"><option value="10">10개씩 보기</option><option value="20">20개씩 보기</option><option value="50">50개씩 보기</option></select>
        </div>
      </div>

      <Card className="py-0 shadow-xs">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <p className="mb-2 text-xs text-muted-foreground md:hidden">표를 좌우로 밀어 더 많은 열을 볼 수 있습니다.</p>
            <Table className="mx-auto w-auto table-auto [&_:is(th,td)]:px-4 [&_:is(th,td)]:py-3">
              <TableHeader><TableRow><TableHead className="whitespace-nowrap">회사명</TableHead><TableHead className="whitespace-nowrap">담당자</TableHead><TableHead className="whitespace-nowrap">연락처</TableHead><TableHead className="whitespace-nowrap">이메일</TableHead><TableHead className="whitespace-nowrap">분류</TableHead><TableHead className="whitespace-nowrap">상태</TableHead><TableHead className="whitespace-nowrap text-right">프로젝트</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-12 text-center"><div className="flex flex-col items-center gap-3"><Building2 className="size-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">{hasFilters ? "검색 결과가 없습니다." : "아직 등록된 거래처가 없습니다."}</p>{hasFilters && <a href="/customers" className="text-xs text-primary underline underline-offset-2">검색 조건 초기화</a>}</div></TableCell></TableRow>
                ) : rows.map((customer) => (
                  <TableRow key={customer.id}><TableCell className="font-medium">{customer.name}</TableCell><TableCell className="text-muted-foreground">{customer.manager ?? "-"}</TableCell><TableCell className="text-muted-foreground">{customer.phone ?? "-"}</TableCell><TableCell className="text-muted-foreground">{customer.email ?? "-"}</TableCell><TableCell className="text-muted-foreground">{customer.category ?? "-"}</TableCell><TableCell><Badge variant="outline" className={toneBadgeClass(customer.status === "거래중" ? "green" : customer.status === "보류" ? "amber" : "gray")}>{customer.status}</Badge></TableCell><TableCell className="text-right tabular-nums text-muted-foreground">{customer.projects.length === 0 ? "-" : `프로젝트 ${customer.projects.length}건`}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
