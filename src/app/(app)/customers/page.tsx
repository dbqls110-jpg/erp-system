import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { canEditMenu, requireMenuAccess } from "@/lib/permissions";
import { Building2, Download, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageIntro } from "@/components/ui/page-intro";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toneBadgeClass } from "@/lib/badge-tone";
import { prisma } from "@/lib/prisma";
import { RESPONSIVE_CONTENT_SELECT_CLASS } from "@/lib/selectStyles";
import { CustomerCreateButton } from "./CustomerCreateButton";
import { CustomerEditButton } from "./CustomerEditButton";

type CustomerSearchParams = Promise<Record<string, string | string[] | undefined>>;

const CATEGORY_BY_QUERY = { customer: "고객사", partner: "협력사", supplier: "공급사" } as const;
const STATUS_BY_QUERY = { active: "거래중", pending: "보류", closed: "종료" } as const;

export default async function CustomersPage({ searchParams }: { searchParams?: CustomerSearchParams }) {
  const session = await getServerSession(authOptions);

  const params = await searchParams;
  const categoryParam = typeof params?.category === "string" ? params.category : "all";
  const statusParam = typeof params?.status === "string" ? params.status : "all";
  const industryParam = typeof params?.industry === "string" ? params.industry.trim() : "";
  const keyword = typeof params?.q === "string" ? params.q.trim() : "";
  const category = CATEGORY_BY_QUERY[categoryParam as keyof typeof CATEGORY_BY_QUERY];
  const status = STATUS_BY_QUERY[statusParam as keyof typeof STATUS_BY_QUERY];
  const where: Prisma.CustomerWhereInput = {};

  if (category) where.category = category;
  if (status) where.status = status;
  if (industryParam) where.industry = industryParam;
  if (keyword) {
    where.OR = [
      { name: { contains: keyword, mode: "insensitive" } },
      { manager: { contains: keyword, mode: "insensitive" } },
      { industry: { contains: keyword, mode: "insensitive" } },
    ];
  }

  // 권한 검사가 실패하면 예외가 전파되어 JSX를 반환하지 않으므로 목록 조회를 함께 시작해도
  // 권한 없는 자료가 응답에 포함되지 않는다. 권한 자료는 React.cache 로 한 번만 읽는다.
  const [, canEdit, rows, industryRows] = await Promise.all([
    requireMenuAccess(session!.user.id, "customers", session!.user.role),
    canEditMenu(session!.user.id, "customers", session!.user.role),
    prisma.customer.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { projects: { include: { project: { select: { id: true, name: true } } } } },
    }),
    prisma.customer.findMany({
      where: { industry: { not: null }, NOT: { industry: "" } },
      orderBy: { industry: "asc" },
      distinct: ["industry"],
      select: { industry: true },
    }),
  ]);
  const industries = industryRows.flatMap((row) => (row.industry ? [row.industry] : []));
  const hasFilters = Boolean(keyword || category || status || industryParam);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageIntro>고객·협력사 정보</PageIntro>
        <div className="flex gap-2">
          <a href="/customers" className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-border bg-background px-3.5 text-[13px] font-semibold hover:bg-muted hover:text-foreground">
            <RefreshCw className="size-3.5" /> 새로고침
          </a>
          {canEdit && <CustomerCreateButton industries={industries} />}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <form method="get" className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="customer-category" className="w-20 shrink-0 text-sm text-muted-foreground">분류</label>
              <select id="customer-category" name="category" defaultValue={categoryParam} className="h-9 w-36 rounded-[10px] border border-border bg-input/50 px-3 text-[13px] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
                <option value="all">전체</option><option value="customer">고객사</option><option value="partner">협력사</option><option value="supplier">공급사</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="customer-industry" className="w-20 shrink-0 text-sm text-muted-foreground">업종</label>
              <select id="customer-industry" name="industry" defaultValue={industryParam} className={`h-9 ${RESPONSIVE_CONTENT_SELECT_CLASS} rounded-[10px] border border-border bg-input/50 px-3 text-[13px] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30`}>
                <option value="">전체</option>
                {industries.map((industry) => <option key={industry} value={industry}>{industry}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="customer-status" className="w-20 shrink-0 text-sm text-muted-foreground">상태</label>
              <select id="customer-status" name="status" defaultValue={statusParam} className="h-9 w-36 rounded-[10px] border border-border bg-input/50 px-3 text-[13px] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
                <option value="all">전체</option><option value="active">거래중</option><option value="pending">보류</option><option value="closed">종료</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="customer-keyword" className="w-20 shrink-0 text-sm text-muted-foreground">검색 키워드</label>
              <Input id="customer-keyword" name="q" defaultValue={keyword} className="w-64" placeholder="회사명, 담당자, 업종 검색" />
            </div>
            <div className="flex justify-end gap-2">
              <a href="/customers" className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">초기화</a>
              <Button type="submit">조회</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">총 <span className="font-semibold text-primary">{rows.length}</span>건</p>
        <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:flex-row sm:items-center">
          <Button variant="outline" className="shrink-0"><Download className="size-3.5" /> 엑셀 다운로드</Button>
          <select defaultValue="updated" aria-label="정렬" className={`h-9 ${RESPONSIVE_CONTENT_SELECT_CLASS} rounded-[10px] border border-border bg-input/50 px-3 text-[13px] text-foreground`}><option value="updated">최종수정일순</option><option value="name">회사명순</option></select>
          <select defaultValue="10" aria-label="페이지 크기" className={`h-9 ${RESPONSIVE_CONTENT_SELECT_CLASS} rounded-[10px] border border-border bg-input/50 px-3 text-[13px] text-foreground`}><option value="10">10개씩 보기</option><option value="20">20개씩 보기</option><option value="50">50개씩 보기</option></select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="space-y-2 p-3 md:hidden">
            {rows.length === 0 ? (
              <EmptyState icon={<Building2 className="size-5" />}>
                {hasFilters ? "검색 결과가 없습니다." : "아직 등록된 거래처가 없습니다."}
                {hasFilters && <a href="/customers" className="text-xs text-primary underline underline-offset-2">검색 조건 초기화</a>}
              </EmptyState>
            ) : rows.map((customer) => (
              <article key={customer.id} className="rounded-[12px] border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{customer.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">담당자 {customer.manager ?? "-"} · {customer.phone ?? "-"}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0" >{customer.status}</Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <div><dt className="inline">업종 </dt><dd className="inline text-foreground">{customer.industry ?? "-"}</dd></div>
                  <div><dt className="inline">분류 </dt><dd className="inline text-foreground">{customer.category ?? "-"}</dd></div>
                  <div><dt className="inline">프로젝트 </dt><dd className="inline text-foreground">{customer.projects.length === 0 ? "-" : `${customer.projects.length}건`}</dd></div>
                  <div className="col-span-2 truncate"><dt className="inline">이메일 </dt><dd className="inline text-foreground">{customer.email ?? "-"}</dd></div>
                </dl>
                {canEdit && <div className="mt-3 flex justify-end border-t border-border pt-2"><CustomerEditButton customer={customer} industries={industries} /></div>}
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <p className="mb-2 text-xs text-muted-foreground md:hidden">표를 좌우로 밀어 더 많은 열을 볼 수 있습니다.</p>
              <Table className="w-full min-w-[820px] table-auto">
              <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead className="whitespace-nowrap">회사명</TableHead><TableHead className="whitespace-nowrap">업종</TableHead><TableHead className="whitespace-nowrap">담당자</TableHead><TableHead className="whitespace-nowrap">연락처</TableHead><TableHead className="whitespace-nowrap">이메일</TableHead><TableHead className="whitespace-nowrap">분류</TableHead><TableHead className="whitespace-nowrap">상태</TableHead><TableHead className="whitespace-nowrap text-right">프로젝트</TableHead>{canEdit && <TableHead className="whitespace-nowrap">관리</TableHead>}</TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                   <TableRow><TableCell colSpan={canEdit ? 9 : 8} className="text-center"><EmptyState icon={<Building2 className="size-5" />}>{hasFilters ? "검색 결과가 없습니다." : "아직 등록된 거래처가 없습니다."}{hasFilters && <a href="/customers" className="mt-1 block text-xs text-primary underline underline-offset-2">검색 조건 초기화</a>}</EmptyState></TableCell></TableRow>
                ) : rows.map((customer) => (
                  <TableRow key={customer.id} className="group transition-colors hover:bg-muted/30"><TableCell className="font-medium">{customer.name}</TableCell><TableCell className="text-muted-foreground">{customer.industry ?? "-"}</TableCell><TableCell className="text-muted-foreground">{customer.manager ?? "-"}</TableCell><TableCell className="text-muted-foreground">{customer.phone ?? "-"}</TableCell><TableCell className="text-muted-foreground">{customer.email ?? "-"}</TableCell><TableCell className="text-muted-foreground">{customer.category ?? "-"}</TableCell><TableCell><Badge variant="outline" className={toneBadgeClass(customer.status === "거래중" ? "green" : customer.status === "보류" ? "amber" : "gray")}>{customer.status}</Badge></TableCell><TableCell className="text-right tabular-nums text-muted-foreground">{customer.projects.length === 0 ? "-" : `프로젝트 ${customer.projects.length}건`}</TableCell>{canEdit && <TableCell><CustomerEditButton customer={customer} industries={industries} iconOnly /></TableCell>}</TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
