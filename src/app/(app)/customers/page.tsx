import { Building2, Download, Plus, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { toneBadgeClass } from "@/lib/badge-tone"
import { prisma } from "@/lib/prisma"

export default async function CustomersPage() {
  const rows = await prisma.customer.findMany({
    orderBy: { updatedAt: "desc" },
    include: { projects: { include: { project: { select: { id: true, name: true } } } } },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="mt-1 text-sm text-muted-foreground">고객·협력사 정보</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-9 py-2">
            <RefreshCw className="size-3.5" />
            새로고침
          </Button>
          <Button className="h-9 py-2">
            <Plus className="size-3.5" />
            등록
          </Button>
        </div>
      </div>

      <Card className="shadow-xs">
        <CardContent className="space-y-3 pt-(--card-spacing)">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">분류</span>
            <select defaultValue="all" className="h-8 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30 w-36">
                  <option value="all">전체</option>
                  <option value="customer">고객사</option>
                  <option value="partner">협력사</option>
                  <option value="supplier">공급사</option>
                </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">상태</span>
            <select defaultValue="all" className="h-8 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30 w-36">
                  <option value="all">전체</option>
                  <option value="active">거래중</option>
                  <option value="pending">보류</option>
                  <option value="closed">종료</option>
                </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">검색키워드</span>
            <Input className="h-8 w-64" placeholder="회사명, 담당자 검색" />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-8">
              초기화
            </Button>
            <Button className="h-8">조회</Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm">
          총 <span className="font-semibold text-primary">{rows.length}</span>건
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-8">
            <Download className="size-3.5" />
            엑셀 다운로드
          </Button>
          <select defaultValue="updated" className="h-8 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30 w-36">
                  <option value="updated">최종수정일순</option>
                  <option value="name">회사명순</option>
                </select>
          <select defaultValue="10" className="h-8 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30 w-28">
                  <option value="10">10개씩 보기</option>
                  <option value="20">20개씩 보기</option>
                  <option value="50">50개씩 보기</option>
                </select>
        </div>
      </div>

      <Card className="shadow-xs py-0">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="[&_:is(th,td)]:px-4">
              <TableHeader>
                <TableRow>
                  <TableHead>회사명</TableHead>
                  <TableHead>담당자</TableHead>
                  <TableHead>연락처</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead>분류</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>최종수정일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Building2 className="size-6 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">아직 등록된 항목이 없습니다</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.manager ?? "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{c.phone ?? "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{c.email ?? "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{c.category ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={toneBadgeClass(c.status === "거래중" ? "green" : c.status === "보류" ? "amber" : "gray")}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {c.projects.length === 0 ? "-" : (
                          <span title={c.projects.map((x) => x.project.name).join(", ")}>
                            프로젝트 {c.projects.length}건
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
